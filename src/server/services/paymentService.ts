// Payment lifecycle (§5.2, BR-05, BR-09). Every mutation re-reads the order's
// payments inside the same transaction, recomputes balanceDue via the pure
// domain function, writes it back, and flips DELIVERED ↔ CLOSED when the
// verified balance crosses zero.
import Decimal from "decimal.js";
import {
  prisma,
  type Prisma,
  type OrderStatus,
  type PaymentMethod,
  type PaymentType,
  type Role,
} from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";
import { allocateCounter } from "@/server/repo/counters";
import { receiptNumber, receiptCounterKey } from "@/server/domain/order/numbering";
import { fyLabelOf } from "@/server/domain/fy";
import { toDbString, dec } from "@/server/domain/money";
import { computeBalance } from "@/server/domain/payment/balance";
import {
  inferPaymentType,
  isPaidOnAllowed,
  isProofPathFor,
} from "@/server/domain/payment/record";

// ───────── Record ─────────

export type RecordPaymentInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  orderId: string;
  /** Omit to infer from context (§11.5 has no type picker) — see inferPaymentType. */
  type?: Exclude<PaymentType, "REFUND">;
  method: PaymentMethod;
  amount: Decimal.Value;
  paidOn: Date;
  receivedIntoAccountId?: string | null;
  receivedByUserId?: string | null;
  referenceNo?: string | null;
  proofPath?: string | null;
  note?: string | null;
};

export async function recordPayment(input: RecordPaymentInput) {
  assertReceiverExclusive(input);
  const amount = dec(input.amount);
  if (!amount.isPositive() || amount.isZero()) {
    throw new AppError("VALIDATION", "Payment amount must be positive.");
  }
  if (!isPaidOnAllowed(input.paidOn, new Date())) {
    throw new AppError("VALIDATION", "Payment date cannot be in the future.");
  }
  if (input.proofPath && !isProofPathFor(input.proofPath, input.tenantId, input.orderId)) {
    throw new AppError("VALIDATION", "Proof upload does not belong to this order.");
  }

  const order = await prisma.order.findFirst({
    where: { tenantId: input.tenantId, id: input.orderId },
    select: {
      id: true,
      number: true,
      total: true,
      status: true,
      salespersonId: true,
      orderDate: true,
    },
  });
  if (!order) throw new AppError("NOT_FOUND", "Order not found.");

  if (input.actorRole === "SALES" && order.salespersonId !== input.actorId) {
    throw new AppError("FORBIDDEN", "Sales can only record payments on their own orders.");
  }
  if (order.status === "CANCELLED") {
    throw new AppError("VALIDATION", "This order is cancelled — record a refund instead.");
  }
  await assertReceiverInTenant(input);

  // Overpayment check uses the current pending+verified total (BR-09 netReceived).
  const existingPayments = await prisma.payment.findMany({
    where: { orderId: order.id, status: { not: "REJECTED" } },
    select: { type: true, status: true, amount: true },
  });
  const current = existingPayments.map((p) => ({
    type: p.type,
    status: p.status,
    amount: p.amount.toString(),
  }));
  const type =
    input.type ??
    inferPaymentType({
      amount,
      balanceDue: computeBalance(
        { total: order.total.toString(), status: order.status },
        current,
      ).balanceDue,
      priorLivePayments: current.filter((p) => p.type !== "REFUND").length,
    });
  const prospective = [
    ...current,
    { type, status: "PENDING_VERIFICATION" as const, amount: amount.toString() },
  ];
  const projected = computeBalance(
    { total: order.total.toString(), status: order.status },
    prospective,
  );
  if (projected.balanceDue.isNegative() && projected.balanceDue.abs().greaterThan("1")) {
    throw new AppError(
      "VALIDATION",
      `Payment exceeds balance by ₹${projected.balanceDue.abs().toFixed(2)}.`,
    );
  }

  const fy = fyLabelOf(order.orderDate);

  return prisma.$transaction(async (tx) => {
    const seq = await allocateCounter(tx, {
      tenantId: input.tenantId,
      key: receiptCounterKey(fy),
    });
    const receiptNo = receiptNumber(fy, seq);

    const payment = await tx.payment.create({
      data: {
        tenantId: input.tenantId,
        receiptNo,
        orderId: order.id,
        type,
        method: input.method,
        amount: toDbString(amount),
        paidOn: input.paidOn,
        receivedIntoAccountId: input.receivedIntoAccountId ?? null,
        receivedByUserId: input.receivedByUserId ?? null,
        referenceNo: input.referenceNo ?? null,
        proofPath: input.proofPath ?? null,
        note: input.note ?? null,
        createdById: input.actorId,
      },
    });

    await recomputeAndWriteBalance(tx, order.id);

    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "PAYMENT_RECORD",
      entity: "Payment",
      entityId: payment.id,
      after: {
        orderNumber: order.number,
        amount: payment.amount.toString(),
        method: payment.method,
        receiptNo,
      },
    });

    return { paymentId: payment.id, receiptNo, type };
  });
}

// ───────── Verify ─────────

export type VerifyPaymentInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  paymentIds: string[]; // bulk — may be a single id
};

export async function verifyPayments(input: VerifyPaymentInput) {
  if (input.paymentIds.length === 0) {
    throw new AppError("VALIDATION", "Pick at least one payment to verify.");
  }
  if (input.actorRole === "SALES" || input.actorRole === "DISPATCH") {
    throw new AppError("FORBIDDEN", "Only Owner, Admin or Accounts can verify payments.");
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.payment.findMany({
      where: {
        tenantId: input.tenantId,
        id: { in: input.paymentIds },
        status: "PENDING_VERIFICATION",
      },
      select: { id: true, orderId: true, type: true, amount: true },
    });
    if (rows.length === 0) {
      throw new AppError("VALIDATION", "None of these payments is pending verification.");
    }

    const now = new Date();
    await tx.payment.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: {
        status: "VERIFIED",
        verifiedById: input.actorId,
        verifiedAt: now,
      },
    });

    const affectedOrderIds = Array.from(new Set(rows.map((r) => r.orderId)));
    for (const orderId of affectedOrderIds) {
      await recomputeAndWriteBalance(tx, orderId);
    }

    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "PAYMENT_VERIFY",
      entity: "Payment",
      entityId: rows[0]!.id,
      after: { count: rows.length, ids: rows.map((r) => r.id) },
    });

    return { verifiedCount: rows.length, orderIds: affectedOrderIds };
  });
}

// ───────── Reject ─────────

export type RejectPaymentInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  paymentId: string;
  reason: string;
};

export async function rejectPayment(input: RejectPaymentInput) {
  if (input.actorRole === "SALES" || input.actorRole === "DISPATCH") {
    throw new AppError("FORBIDDEN", "Only Owner, Admin or Accounts can reject payments.");
  }
  if (!input.reason.trim()) {
    throw new AppError("VALIDATION", "Rejection reason is required.");
  }

  return prisma.$transaction(async (tx) => {
    const before = await tx.payment.findFirst({
      where: { tenantId: input.tenantId, id: input.paymentId },
      select: { id: true, orderId: true, status: true, order: { select: { salespersonId: true, number: true } } },
    });
    if (!before) throw new AppError("NOT_FOUND", "Payment not found.");
    if (before.status === "REJECTED") {
      throw new AppError("VALIDATION", "This payment is already rejected.");
    }

    const after = await tx.payment.update({
      where: { id: before.id },
      data: {
        status: "REJECTED",
        rejectReason: input.reason.trim(),
        verifiedById: input.actorId,
        verifiedAt: new Date(),
      },
    });

    await recomputeAndWriteBalance(tx, before.orderId);

    // Notify the salesperson so they can follow up with the customer.
    await tx.notification.create({
      data: {
        tenantId: input.tenantId,
        userId: before.order.salespersonId,
        kind: "PAYMENT_REJECTED",
        title: `Payment rejected on ${before.order.number}`,
        body: input.reason.trim(),
        link: `/orders/${before.orderId}`,
      },
    });

    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "PAYMENT_REJECT",
      entity: "Payment",
      entityId: before.id,
      before: { status: before.status },
      after: { status: "REJECTED", reason: input.reason.trim() },
    });

    return { paymentId: after.id };
  });
}

// ───────── Refund ─────────

export type RefundInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  orderId: string;
  amount: Decimal.Value;
  method: PaymentMethod;
  paidOn: Date;
  receivedIntoAccountId?: string | null; // where the money went OUT from
  referenceNo?: string | null;
  note?: string | null;
};

export async function recordRefund(input: RefundInput) {
  if (input.actorRole === "SALES" || input.actorRole === "DISPATCH") {
    throw new AppError("FORBIDDEN", "Only Owner, Admin or Accounts can record refunds.");
  }
  const amount = dec(input.amount);
  if (!amount.isPositive() || amount.isZero()) {
    throw new AppError("VALIDATION", "Refund amount must be positive.");
  }

  const order = await prisma.order.findFirst({
    where: { tenantId: input.tenantId, id: input.orderId },
    select: { id: true, number: true, orderDate: true },
  });
  if (!order) throw new AppError("NOT_FOUND", "Order not found.");
  const fy = fyLabelOf(order.orderDate);

  return prisma.$transaction(async (tx) => {
    const seq = await allocateCounter(tx, {
      tenantId: input.tenantId,
      key: receiptCounterKey(fy),
    });
    const receiptNo = receiptNumber(fy, seq);

    const payment = await tx.payment.create({
      data: {
        tenantId: input.tenantId,
        receiptNo,
        orderId: order.id,
        type: "REFUND",
        method: input.method,
        amount: toDbString(amount),
        paidOn: input.paidOn,
        // Refunds go OUT of a company account — we repurpose receivedIntoAccountId
        // as the "paid-from" field. The CHECK constraint still requires exactly one
        // of the two columns; we always set receivedIntoAccountId for refunds.
        receivedIntoAccountId: input.receivedIntoAccountId ?? null,
        receivedByUserId: null,
        referenceNo: input.referenceNo ?? null,
        note: input.note ?? null,
        // Refunds enter the ledger as PENDING_VERIFICATION like inbound payments;
        // Accounts verifies the bank/UPI debit before it counts as verified.
        createdById: input.actorId,
      },
    });

    await recomputeAndWriteBalance(tx, order.id);

    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "PAYMENT_REFUND",
      entity: "Payment",
      entityId: payment.id,
      after: {
        orderNumber: order.number,
        amount: payment.amount.toString(),
        receiptNo,
      },
    });

    return { paymentId: payment.id, receiptNo };
  });
}

// ───────── Mark deposited (cash-with-staff → company) ─────────

export type MarkDepositedInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  paymentId: string;
  depositedToAccountId: string;
  depositedOn: Date;
};

export async function markDeposited(input: MarkDepositedInput) {
  if (input.actorRole !== "OWNER" && input.actorRole !== "ADMIN" && input.actorRole !== "ACCOUNTS") {
    throw new AppError("FORBIDDEN", "Only Owner, Admin or Accounts can mark deposits.");
  }

  const before = await prisma.payment.findFirst({
    where: { tenantId: input.tenantId, id: input.paymentId },
    select: {
      id: true,
      receivedByUserId: true,
      depositedToAccountId: true,
      status: true,
    },
  });
  if (!before) throw new AppError("NOT_FOUND", "Payment not found.");
  if (!before.receivedByUserId) {
    throw new AppError("VALIDATION", "This payment was not received by a person.");
  }
  if (before.depositedToAccountId) {
    throw new AppError("VALIDATION", "This payment is already marked deposited.");
  }

  const account = await prisma.account.findFirst({
    where: { tenantId: input.tenantId, id: input.depositedToAccountId },
    select: { id: true },
  });
  if (!account) throw new AppError("NOT_FOUND", "Destination account not found.");

  const after = await prisma.payment.update({
    where: { id: before.id },
    data: {
      depositedToAccountId: input.depositedToAccountId,
      depositedOn: input.depositedOn,
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "PAYMENT_DEPOSIT",
    entity: "Payment",
    entityId: before.id,
    after: {
      depositedToAccountId: input.depositedToAccountId,
      depositedOn: input.depositedOn,
    },
  });

  return after;
}

// ───────── Internals ─────────

export async function recomputeAndWriteBalance(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, total: true, status: true },
  });
  if (!order) return;

  const payments = await tx.payment.findMany({
    where: { orderId, status: { not: "REJECTED" } },
    select: { type: true, status: true, amount: true },
  });

  const result = computeBalance(
    { total: order.total.toString(), status: order.status },
    payments.map((p) => ({ type: p.type, status: p.status, amount: p.amount.toString() })),
  );

  let newStatus: OrderStatus | undefined;
  if (result.shouldClose) newStatus = "CLOSED";
  else if (result.shouldReopen) newStatus = "DELIVERED";

  await tx.order.update({
    where: { id: orderId },
    data: {
      balanceDue: toDbString(result.balanceDue),
      ...(newStatus ? { status: newStatus } : {}),
    },
  });

  if (newStatus) {
    await tx.orderEvent.create({
      data: {
        orderId,
        actorId: "system",
        type: "STATUS_CHANGE",
        fromStatus: order.status as OrderStatus,
        toStatus: newStatus,
        note: newStatus === "CLOSED" ? "Balance paid — auto-closed" : "Payment reversed — reopened",
      },
    });
  }
}

// The receiver ids arrive from the client — make sure they point inside this tenant.
async function assertReceiverInTenant(input: {
  tenantId: string;
  receivedIntoAccountId?: string | null;
  receivedByUserId?: string | null;
}): Promise<void> {
  if (input.receivedIntoAccountId) {
    const account = await prisma.account.findFirst({
      where: { tenantId: input.tenantId, id: input.receivedIntoAccountId, active: true },
      select: { id: true },
    });
    if (!account) throw new AppError("VALIDATION", "Pick an active company account.");
  }
  if (input.receivedByUserId) {
    const user = await prisma.user.findFirst({
      where: {
        tenantId: input.tenantId,
        id: input.receivedByUserId,
        active: true,
        canReceivePayments: true,
      },
      select: { id: true },
    });
    if (!user) throw new AppError("VALIDATION", "That person cannot receive payments.");
  }
}

function assertReceiverExclusive(input: {
  receivedIntoAccountId?: string | null;
  receivedByUserId?: string | null;
}): void {
  const hasAccount = Boolean(input.receivedIntoAccountId);
  const hasUser = Boolean(input.receivedByUserId);
  if (hasAccount === hasUser) {
    throw new AppError(
      "VALIDATION",
      "Payment must land in exactly one of: a company account OR a person.",
    );
  }
}
