// v1.1 §4.3 — the simplified order-create path.
//
// Takes free-text product, phone, name, total, and an optional advance payment.
// Everything inside one Serializable transaction so parallel creates by the
// same salesperson get sequential S.Nos with no gaps.
import Decimal from "decimal.js";
import { prisma, type Prisma, type OrderStatusV2 } from "@/server/repo/client";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";
import { upsertCustomerByPhone } from "@/server/services/customerService";
import { allocateCounter } from "@/server/repo/counters";
import { fyLabelOf, istYearMonth } from "@/server/domain/fy";
import { orderCounterKey, orderNumber } from "@/server/domain/order/numbering";
import { snoKey } from "@/server/domain/v1_1/serialNo";
import { computeBalance, applyPayment } from "@/server/domain/v1_1/balance";
import { istDateString } from "@/server/domain/payment/record";

/** Today's IST calendar date as a UTC-midnight Date, for `@db.Date` columns
 *  (a plain `new Date()` would store the UTC date — yesterday before 05:30 IST). */
function istToday(): Date {
  return new Date(`${istDateString(new Date())}T00:00:00.000Z`);
}

export type CreateOrderV2Input = {
  tenantId: string;
  salespersonId: string;
  actorId: string;
  productText: string;
  contactPhone: string; // raw, will be normalized to E.164
  customerName: string;
  total: string; // decimal string
  paid?: string; // optional advance; decimal string
  paymentMethod?: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";
  orderDate?: Date; // defaults to now
  entityId?: string; // defaults to salesperson's defaultEntityId or first active
  billFromKI?: boolean; // §4.3 optional — only used for defaulting entity
  note?: string;
};

export async function createOrderV2(input: CreateOrderV2Input) {
  // ─── Validate up-front (fail fast, before touching DB) ─────────────
  const productText = input.productText.trim();
  if (productText.length === 0 || productText.length > 500) {
    throw new AppError("VALIDATION", "Type what the customer ordered.");
  }
  const customerName = input.customerName.trim();
  if (customerName.length === 0 || customerName.length > 120) {
    throw new AppError("VALIDATION", "Enter the customer's name.");
  }
  let phoneE164: string;
  try {
    phoneE164 = normalizePhone(input.contactPhone).e164;
  } catch (e) {
    if (e instanceof PhoneParseError) {
      throw new AppError("VALIDATION", "Enter a 10-digit mobile number.");
    }
    throw e;
  }
  const total = new Decimal(input.total);
  if (total.isNaN() || total.lessThanOrEqualTo(0)) {
    throw new AppError("VALIDATION", "Total must be more than ₹0.");
  }
  const advance = input.paid ? new Decimal(input.paid) : new Decimal(0);
  if (advance.isNaN() || advance.isNegative()) {
    throw new AppError("VALIDATION", "Paid can't be negative.");
  }
  if (advance.greaterThan(total)) {
    throw new AppError(
      "VALIDATION",
      `Paid can't be more than the total (₹${total.toFixed(0)}).`,
    );
  }

  const orderDate = input.orderDate ?? istToday();

  // Resolve entity: user's default, or first active in the tenant.
  const entity = await resolveEntity(input.tenantId, input.salespersonId, input.entityId);
  const fyLabel = fyLabelOf(orderDate);

  // Upsert the customer by phone (outside the main tx — races are safe thanks
  // to (tenantId, phoneE164) unique constraint).
  const { customer } = await upsertCustomerByPhone({
    tenantId: input.tenantId,
    actorId: input.actorId,
    phoneE164,
    name: customerName,
    ownerUserId: input.salespersonId,
  });

  // ─── Create the order under Serializable isolation (with retry) ────
  const result = await runWithSerializableRetry(() =>
    prisma.$transaction(
    async (tx) => {
      // S.No per salesperson (BR-04-style counter row).
      const serialNo = await allocateCounter(tx, {
        tenantId: input.tenantId,
        key: snoKey(input.salespersonId),
      });
      // v1.0 global order number — kept so historical reports still work.
      const seq = await allocateCounter(tx, {
        tenantId: input.tenantId,
        key: orderCounterKey(entity.code, fyLabel),
      });
      const number = orderNumber(entity.code, fyLabel, seq);

      const balance = computeBalance(total, advance);

      const order = await tx.order.create({
        data: {
          tenantId: input.tenantId,
          number,
          entityId: entity.id,
          customerId: customer.id,
          salespersonId: input.salespersonId,
          orderDate,
          status: "CONFIRMED", // v1.0 column retained; UI reads simpleStatus
          simpleStatus: "PENDING",
          subtotal: total.toFixed(2),
          chargesTotal: "0.00",
          discount: "0.00",
          total: total.toFixed(2),
          balanceDue: balance.toFixed(2),
          paidTotal: advance.toFixed(2),
          serialNo,
          productText,
          notes: input.note ?? null,
          createdById: input.actorId,
        },
      });

      // Optional advance payment — written as VERIFIED immediately (v1.1 §4.5).
      let payment = null;
      if (advance.greaterThan(0)) {
        const rSeq = await allocateCounter(tx, {
          tenantId: input.tenantId,
          key: `RCPT:${fyLabel}`,
        });
        payment = await tx.payment.create({
          data: {
            tenantId: input.tenantId,
            receiptNo: `RCPT/${fyLabel}/${String(rSeq).padStart(5, "0")}`,
            orderId: order.id,
            type: "ADVANCE",
            method: input.paymentMethod ?? "UPI",
            amount: advance.toFixed(2),
            paidOn: orderDate,
            status: "VERIFIED",
            verifiedById: input.actorId,
            verifiedAt: new Date(),
            createdById: input.actorId,
          },
        });
      }

      await writeAudit(tx, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "ORDER_CREATE_V2",
        entity: "Order",
        entityId: order.id,
        after: {
          serialNo: order.serialNo,
          number: order.number,
          productText: order.productText,
          total: order.total.toString(),
          paidTotal: order.paidTotal.toString(),
        },
      });

      return { order, payment, customer };
    },
    { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel },
  ));

  return result;
}

async function resolveEntity(tenantId: string, userId: string, hinted?: string) {
  if (hinted) {
    const e = await prisma.billingEntity.findFirst({
      where: { tenantId, id: hinted, active: true },
      select: { id: true, code: true },
    });
    if (e) return e;
  }
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultEntityId: true },
  });
  if (u?.defaultEntityId) {
    const e = await prisma.billingEntity.findFirst({
      where: { tenantId, id: u.defaultEntityId, active: true },
      select: { id: true, code: true },
    });
    if (e) return e;
  }
  const first = await prisma.billingEntity.findFirst({
    where: { tenantId, active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true },
  });
  if (!first) {
    throw new AppError(
      "VALIDATION",
      "No billing entity configured. Admin must add one in Settings.",
    );
  }
  return first;
}

// ─── Status transitions ─────────────────────────────────────────────

export async function setOrderStatusV2(input: {
  tenantId: string;
  actorId: string;
  orderId: string;
  status: OrderStatusV2;
  cancelReason?: string;
}) {
  const current = await prisma.order.findFirst({
    where: { tenantId: input.tenantId, id: input.orderId },
    select: { id: true, simpleStatus: true, salespersonId: true, serialNo: true, completedAt: true },
  });
  if (!current) throw new AppError("NOT_FOUND", "Order not found.");

  if (input.status === "CANCELLED" && !input.cancelReason?.trim()) {
    throw new AppError("VALIDATION", "Cancellation needs a one-line reason.");
  }

  const row = await prisma.order.update({
    where: { id: input.orderId },
    data: {
      simpleStatus: input.status,
      // Keep the original completion date if it's already completed (re-saving
      // must not move the order into a different month).
      completedAt:
        input.status === "COMPLETED"
          ? current.simpleStatus === "COMPLETED" && current.completedAt
            ? current.completedAt
            : istToday()
          : null,
      cancelNote: input.status === "CANCELLED" ? input.cancelReason ?? null : null,
      // Mirror the v1.0 status column so legacy queries still work.
      status:
        input.status === "COMPLETED"
          ? "DELIVERED"
          : input.status === "CANCELLED"
            ? "CANCELLED"
            : "CONFIRMED",
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "ORDER_STATUS_V2",
    entity: "Order",
    entityId: input.orderId,
    before: { simpleStatus: current.simpleStatus },
    after: { simpleStatus: input.status, cancelReason: input.cancelReason ?? null },
  });

  return row;
}

// ─── Editable fields (Product/Contact/Customer name/Total) while PENDING ─

export async function updateOrderFieldsV2(input: {
  tenantId: string;
  actorId: string;
  actorRole: "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "DISPATCH";
  orderId: string;
  productText?: string;
  total?: string;
  customerName?: string;
}) {
  const current = await prisma.order.findFirst({
    where: { tenantId: input.tenantId, id: input.orderId },
    select: {
      id: true,
      simpleStatus: true,
      productText: true,
      total: true,
      paidTotal: true,
      customerId: true,
      salespersonId: true,
    },
  });
  if (!current) throw new AppError("NOT_FOUND", "Order not found.");
  const isAdmin = input.actorRole === "OWNER" || input.actorRole === "ADMIN";
  // v1.1 §7 — admins can edit any field of any order, including completed.
  // Employees can only edit their own PENDING orders.
  if (!isAdmin) {
    if (current.salespersonId !== input.actorId) {
      throw new AppError("FORBIDDEN", "You can only edit your own orders.");
    }
    if (current.simpleStatus !== "PENDING") {
      throw new AppError("VALIDATION", "Only pending orders can be edited.");
    }
  }

  // Validate inputs up front; do the writes in one transaction that re-reads
  // paidTotal, so a concurrent payment can't leave balanceDue stale.
  const productText = input.productText?.trim();
  if (input.productText !== undefined && !productText) {
    throw new AppError("VALIDATION", "Type what the customer ordered.");
  }
  const newTotal = input.total !== undefined ? new Decimal(input.total) : null;
  if (newTotal && (newTotal.isNaN() || newTotal.lessThanOrEqualTo(0))) {
    throw new AppError("VALIDATION", "Total must be more than ₹0.");
  }
  const customerName = input.customerName?.trim();
  if (input.customerName !== undefined && !customerName) {
    throw new AppError("VALIDATION", "Enter the customer's name.");
  }

  const row = await runWithSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        const data: Prisma.OrderUpdateInput = {};
        if (productText) data.productText = productText;
        if (newTotal) {
          const fresh = await tx.order.findUniqueOrThrow({
            where: { id: input.orderId },
            select: { paidTotal: true },
          });
          const paid = new Decimal(fresh.paidTotal.toString());
          if (paid.greaterThan(newTotal)) {
            throw new AppError(
              "VALIDATION",
              `Total can't be less than payments already recorded (₹${paid.toFixed(0)}).`,
            );
          }
          data.subtotal = newTotal.toFixed(2);
          data.total = newTotal.toFixed(2);
          data.balanceDue = computeBalance(newTotal, paid).toFixed(2);
        }
        if (customerName) {
          await tx.customer.update({ where: { id: current.customerId }, data: { name: customerName } });
        }
        return tx.order.update({ where: { id: input.orderId }, data });
      },
      { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel },
    ),
  );

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "ORDER_EDIT_V2",
    entity: "Order",
    entityId: input.orderId,
    before: {
      productText: current.productText,
      total: current.total.toString(),
    },
    after: { productText: row.productText, total: row.total.toString() },
  });

  return row;
}

// ─── Add payment (v1.1 §4.5 — always VERIFIED, no approval queue) ────

export async function addPaymentV2(input: {
  tenantId: string;
  actorId: string;
  orderId: string;
  amount: string;
  method: "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";
  paidOn?: Date;
  note?: string;
}) {
  const amount = new Decimal(input.amount);
  if (amount.isNaN() || amount.lessThanOrEqualTo(0)) {
    throw new AppError("VALIDATION", "Payment amount must be more than ₹0.");
  }
  const paidOn = input.paidOn ?? istToday();
  const fyLabel = fyLabelOf(paidOn);

  const result = await runWithSerializableRetry(() =>
    prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: { tenantId: input.tenantId, id: input.orderId },
        select: { id: true, total: true, paidTotal: true, simpleStatus: true },
      });
      if (!order) throw new AppError("NOT_FOUND", "Order not found.");
      if (order.simpleStatus === "CANCELLED") {
        throw new AppError("VALIDATION", "Cancelled orders can't take payments.");
      }
      // Paid must stay = Σ payments (v1.1 §2), so a payment can't exceed the balance.
      const due = new Decimal(order.total.toString()).minus(order.paidTotal.toString());
      if (amount.greaterThan(due)) {
        throw new AppError(
          "VALIDATION",
          due.lessThanOrEqualTo(0)
            ? "This order is already fully paid."
            : `That's more than the balance due (₹${due.toFixed(0)}).`,
        );
      }

      const { newPaidTotal, newBalance } = applyPayment(
        order.total.toString(),
        order.paidTotal.toString(),
        amount.toString(),
      );

      const rSeq = await allocateCounter(tx, {
        tenantId: input.tenantId,
        key: `RCPT:${fyLabel}`,
      });

      const payment = await tx.payment.create({
        data: {
          tenantId: input.tenantId,
          receiptNo: `RCPT/${fyLabel}/${String(rSeq).padStart(5, "0")}`,
          orderId: input.orderId,
          type: newBalance.isZero() ? "FINAL" : "PART",
          method: input.method,
          amount: amount.toFixed(2),
          paidOn,
          status: "VERIFIED",
          verifiedById: input.actorId,
          verifiedAt: new Date(),
          note: input.note ?? null,
          createdById: input.actorId,
        },
      });

      await tx.order.update({
        where: { id: input.orderId },
        data: {
          paidTotal: newPaidTotal.toFixed(2),
          balanceDue: newBalance.toFixed(2),
        },
      });

      await writeAudit(tx, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "PAYMENT_ADD_V2",
        entity: "Payment",
        entityId: payment.id,
        after: { amount: amount.toFixed(2), method: input.method, orderId: input.orderId },
      });

      return payment;
    },
    { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel },
  ));

  return result;
}

// ─── Delete payment (own within 24 h, admin any time) ────────────────

export async function deletePaymentV2(input: {
  tenantId: string;
  actorId: string;
  actorRole: "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "DISPATCH";
  paymentId: string;
}) {
  const p = await prisma.payment.findFirst({
    where: { tenantId: input.tenantId, id: input.paymentId },
    select: {
      id: true,
      orderId: true,
      amount: true,
      createdAt: true,
      createdById: true,
      order: { select: { total: true, paidTotal: true, salespersonId: true } },
    },
  });
  if (!p) throw new AppError("NOT_FOUND", "Payment not found.");

  const isAdmin = input.actorRole === "OWNER" || input.actorRole === "ADMIN";
  if (!isAdmin) {
    if (p.createdById !== input.actorId) {
      throw new AppError("FORBIDDEN", "You can only delete your own payments.");
    }
    const hours = (Date.now() - p.createdAt.getTime()) / 36e5;
    if (hours > 24) {
      throw new AppError(
        "VALIDATION",
        "This payment was entered more than 24 hours ago. Ask your admin to delete it.",
      );
    }
  }

  await runWithSerializableRetry(() =>
    prisma.$transaction(
    async (tx) => {
      await tx.payment.delete({ where: { id: input.paymentId } });
      // Re-read inside the transaction so a concurrent payment isn't lost.
      const order = await tx.order.findUniqueOrThrow({
        where: { id: p.orderId },
        select: { total: true, paidTotal: true },
      });
      const nextPaid = new Decimal(order.paidTotal.toString()).minus(p.amount.toString());
      const nextBalance = computeBalance(order.total.toString(), nextPaid);
      await tx.order.update({
        where: { id: p.orderId },
        data: {
          paidTotal: Decimal.max(nextPaid, new Decimal(0)).toFixed(2),
          balanceDue: nextBalance.toFixed(2),
        },
      });
      await writeAudit(tx, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "PAYMENT_DELETE_V2",
        entity: "Payment",
        entityId: input.paymentId,
        before: { amount: p.amount.toString(), orderId: p.orderId },
      });
    },
    { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel },
  ));
}

// Prevent unused-import lint; istYearMonth is reserved for the mobile form
// which groups orders by month label.
void istYearMonth;

// ─── Serializable retry wrapper ─────────────────────────────────────
// Postgres SERIALIZABLE can reject transactions with P2034 under contention;
// retry with jittered exponential backoff so parallel S.No allocations resolve.
async function runWithSerializableRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 8,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = (e as { code?: string }).code;
      const message = (e as Error).message ?? "";
      const isConflict =
        code === "P2034" ||
        code === "P2002" || // unique constraint violation on parallel number alloc
        /serialization failure|write conflict|deadlock|unique constraint/i.test(message);
      if (!isConflict || attempt === maxAttempts) throw e;
      const baseMs = Math.min(50 * 2 ** (attempt - 1), 500);
      await new Promise((r) => setTimeout(r, baseMs + Math.random() * baseMs));
    }
  }
  throw lastErr;
}
