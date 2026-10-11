// Order lifecycle service (spec §5.1, §5.6, BR-04, BR-08, BR-10, BR-11, BR-14).
// All DB writes go through this file so the state machine + counter + audit log
// stay in a single Serializable transaction.
import Decimal from "decimal.js";
import {
  prisma,
  type Prisma,
  type OrderStatus,
  type CancelReason,
  type ChargeKind,
  type PaymentMethod,
  type PaymentType,
  type Role,
} from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";
import { allocateCounter } from "@/server/repo/counters";
import {
  computeTotals,
  type LineInput,
  type ChargeInput,
} from "@/server/domain/order/totals";
import {
  orderNumber,
  orderCounterKey,
  receiptNumber,
  receiptCounterKey,
} from "@/server/domain/order/numbering";
import { fyLabelOf } from "@/server/domain/fy";
import { assertTransition, canCancel } from "@/server/domain/order/stateMachine";
import { toDbString } from "@/server/domain/money";

// Pilot setting defaults (TenantSettings). We fetch per tenant on each create so
// changes to maxSalesDiscountPct etc. are picked up without a redeploy.
async function getSettings(tenantId: string) {
  const s = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!s) throw new AppError("INTERNAL", "Tenant settings missing.");
  return s;
}

export type CreateOrderLineInput = {
  productId?: string | null; // null = custom line
  description: string;
  qty: number;
  listPrice?: Decimal.Value | null; // customerPrice at time of order
  floorPrice?: Decimal.Value | null; // dealerPrice at time of order
  unitPrice: Decimal.Value;
  gstRate?: Decimal.Value;
};

export type CreateOrderChargeInput = {
  kind: ChargeKind;
  label: string;
  amount: Decimal.Value;
};

export type CreateOrderAdvanceInput = {
  amount: Decimal.Value;
  method: PaymentMethod;
  paidOn: Date;
  receivedIntoAccountId?: string | null;
  receivedByUserId?: string | null;
  referenceNo?: string | null;
  note?: string | null;
};

export type CreateOrderInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  entityId: string;
  customerId: string;
  salespersonId: string; // defaults to actor when SALES; may be overridden by OWNER/ADMIN (§6 BR-10)
  orderDate: Date; // defaults today-IST; service validates BR-11
  promisedDeliveryDate?: Date | null;
  promisedPaymentDate?: Date | null;
  lines: CreateOrderLineInput[];
  charges?: CreateOrderChargeInput[];
  discount?: Decimal.Value;
  notes?: string | null;
  advance?: CreateOrderAdvanceInput | null;
};

export type CreateOrderResult = {
  id: string;
  number: string;
  status: OrderStatus;
  needsApproval: boolean;
  total: string;
  balanceDue: string;
};

/**
 * Creates an Order + lines + charges + optional advance Payment in one
 * Serializable transaction. Allocates the order number from DocumentCounter
 * inside the same transaction (BR-04). Records a CREATE audit entry and the
 * initial OrderEvent.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  // ─── Validate inputs (fast fail, before opening the tx) ───
  if (input.lines.length === 0) {
    throw new AppError("VALIDATION", "An order needs at least one line.");
  }

  // BR-11: order date cannot be in the future; back-dating > 7 days needs OWNER/ADMIN.
  const today = startOfISTDay(new Date());
  const requested = startOfISTDay(input.orderDate);
  if (requested.getTime() > today.getTime()) {
    throw new AppError("VALIDATION", "Order date cannot be in the future.");
  }
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (
    requested.getTime() < sevenDaysAgo.getTime() &&
    input.actorRole !== "OWNER" &&
    input.actorRole !== "ADMIN"
  ) {
    throw new AppError(
      "VALIDATION",
      "Back-dating by more than 7 days requires Owner or Admin.",
    );
  }

  // BR-10: SALES can only self-attribute. OWNER/ADMIN may set any salesperson.
  if (
    input.actorRole === "SALES" &&
    input.salespersonId !== input.actorId
  ) {
    throw new AppError("FORBIDDEN", "You can only create orders attributed to yourself.");
  }

  const settings = await getSettings(input.tenantId);

  // Load canonical product data for every productId line so we snapshot list/floor prices
  // from the DB (BR-08). This also lets us detect below-floor pricing (§5.6).
  const productIds = input.lines
    .map((l) => l.productId)
    .filter((v): v is string => Boolean(v));
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { tenantId: input.tenantId, id: { in: productIds } },
        select: {
          id: true,
          customerPrice: true,
          dealerPrice: true,
          gstRate: true,
          name: true,
          spec: true,
        },
      })
    : [];
  const productById = new Map(products.map((p) => [p.id, p]));

  // Normalise lines, pulling list/floor from the DB when a productId is supplied.
  const defaultGstRate = settings.defaultGstRate.toString();
  const normalisedLines = input.lines.map((raw) => {
    const prod = raw.productId ? productById.get(raw.productId) ?? null : null;
    const gstRate =
      raw.gstRate !== undefined
        ? raw.gstRate
        : prod?.gstRate
          ? prod.gstRate.toString()
          : defaultGstRate;
    const listPrice = raw.listPrice ?? (prod?.customerPrice ? prod.customerPrice.toString() : null);
    const floorPrice =
      raw.floorPrice ?? (prod?.dealerPrice ? prod.dealerPrice.toString() : null);
    const description =
      raw.description ||
      (prod ? `${prod.name}${prod.spec ? ` · ${prod.spec}` : ""}` : "Custom item");
    return { raw, gstRate, listPrice, floorPrice, description };
  });

  const totals = computeTotals({
    lines: normalisedLines.map<LineInput>((l) => ({
      qty: l.raw.qty,
      unitPrice: l.raw.unitPrice,
      gstRate: l.gstRate,
    })),
    charges: input.charges?.map<ChargeInput>((c) => ({ amount: c.amount })),
    discount: input.discount ?? 0,
    pricesIncludeGst: settings.pricesIncludeGst,
  });

  // Approval rule (§5.6): any line below max(floor, customer × (1 - maxSalesDiscountPct)) triggers approval.
  const maxDiscount = new Decimal(settings.maxSalesDiscountPct).div(100);
  const needsApproval = normalisedLines.some((l) => {
    const unit = new Decimal(l.raw.unitPrice);
    const floor = l.floorPrice ? new Decimal(l.floorPrice) : null;
    const list = l.listPrice ? new Decimal(l.listPrice) : null;
    const discountedFloor = list ? list.mul(new Decimal(1).minus(maxDiscount)) : null;
    const minAllowed =
      floor && discountedFloor
        ? Decimal.max(floor, discountedFloor)
        : (floor ?? discountedFloor);
    if (!minAllowed) return false;
    return unit.lessThan(minAllowed);
  });

  const customLineOverThreshold = normalisedLines.some(
    (l) => !l.raw.productId && new Decimal(l.raw.unitPrice).greaterThanOrEqualTo(settings.customLineApprovalAbove),
  );
  const requiresApproval = needsApproval || customLineOverThreshold;

  // Advance payment validation.
  const advance = input.advance;
  if (advance) {
    const amount = new Decimal(advance.amount);
    if (!amount.isPositive() || amount.isZero()) {
      throw new AppError("VALIDATION", "Advance amount must be positive.");
    }
    if (amount.greaterThan(totals.total.plus(1))) {
      throw new AppError("VALIDATION", "Advance exceeds order total.");
    }
    if (
      (advance.receivedIntoAccountId && advance.receivedByUserId) ||
      (!advance.receivedIntoAccountId && !advance.receivedByUserId)
    ) {
      throw new AppError(
        "VALIDATION",
        "Advance must land in exactly one of: a company account OR a person.",
      );
    }
  }

  // Resolve entity code (for the order number) outside the tx.
  const entity = await prisma.billingEntity.findFirst({
    where: { tenantId: input.tenantId, id: input.entityId, active: true },
    select: { code: true },
  });
  if (!entity) throw new AppError("NOT_FOUND", "Billing entity not found.");

  const fy = fyLabelOf(input.orderDate);
  const counterKey = orderCounterKey(entity.code, fy);

  // ─── Transaction (Serializable, with retry on write-conflict) ───
  // Postgres Serializable isolation aborts one of the competing transactions
  // with code P2034 ("serialization failure") when they touch the same rows.
  // We retry a bounded number of times with jittered backoff so the counter
  // allocation (which deliberately contends on a single row per entity+FY)
  // still yields a successful create per caller.
  const result = await runWithSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
      const seq = await allocateCounter(tx, {
        tenantId: input.tenantId,
        key: counterKey,
      });
      const number = orderNumber(entity.code, fy, seq);
      const initialStatus: OrderStatus = requiresApproval ? "PENDING_APPROVAL" : "CONFIRMED";

      // netReceived (advance only, PENDING_VERIFICATION counts per BR-09).
      const netReceived = advance ? new Decimal(advance.amount) : new Decimal(0);
      const balanceDue = totals.total.minus(netReceived);

      const created = await tx.order.create({
        data: {
          tenantId: input.tenantId,
          number,
          entityId: input.entityId,
          customerId: input.customerId,
          salespersonId: input.salespersonId,
          orderDate: input.orderDate,
          promisedDeliveryDate: input.promisedDeliveryDate ?? null,
          promisedPaymentDate: input.promisedPaymentDate ?? null,
          status: initialStatus,
          subtotal: toDbString(totals.subtotal),
          chargesTotal: toDbString(totals.chargesTotal),
          discount: toDbString(totals.discount),
          total: toDbString(totals.total),
          balanceDue: toDbString(balanceDue),
          needsApproval: requiresApproval,
          notes: input.notes ?? null,
          createdById: input.actorId,
          lines: {
            create: normalisedLines.map((l, idx) => ({
              productId: l.raw.productId ?? null,
              description: l.description,
              qty: l.raw.qty,
              listPrice: l.listPrice ? toDbString(l.listPrice) : null,
              floorPrice: l.floorPrice ? toDbString(l.floorPrice) : null,
              unitPrice: toDbString(l.raw.unitPrice),
              gstRate: toDbString(l.gstRate),
              lineTotal: toDbString(
                new Decimal(l.raw.unitPrice).mul(l.raw.qty),
              ),
              sortOrder: idx,
            })),
          },
          charges: input.charges?.length
            ? {
                create: input.charges.map((c) => ({
                  kind: c.kind,
                  label: c.label,
                  amount: toDbString(c.amount),
                })),
              }
            : undefined,
          events: {
            create: [
              {
                actorId: input.actorId,
                type: "STATUS_CHANGE",
                toStatus: initialStatus,
                note: requiresApproval ? "Pending price approval" : "Created",
              },
            ],
          },
        },
        select: { id: true, number: true, status: true, needsApproval: true, total: true, balanceDue: true },
      });

      if (advance) {
        const receiptSeq = await allocateCounter(tx, {
          tenantId: input.tenantId,
          key: receiptCounterKey(fy),
        });
        await tx.payment.create({
          data: {
            tenantId: input.tenantId,
            receiptNo: receiptNumber(fy, receiptSeq),
            orderId: created.id,
            type: "ADVANCE" satisfies PaymentType,
            method: advance.method,
            amount: toDbString(advance.amount),
            paidOn: advance.paidOn,
            receivedIntoAccountId: advance.receivedIntoAccountId ?? null,
            receivedByUserId: advance.receivedByUserId ?? null,
            referenceNo: advance.referenceNo ?? null,
            note: advance.note ?? null,
            createdById: input.actorId,
            // status defaults to PENDING_VERIFICATION — Accounts verifies in P3.
          },
        });
      }

      await writeAudit(tx, {
        tenantId: input.tenantId,
        actorId: input.actorId,
        action: "ORDER_CREATE",
        entity: "Order",
        entityId: created.id,
        after: {
          number: created.number,
          status: created.status,
          total: created.total.toString(),
        },
      });

      return created;
    },
      { isolationLevel: "Serializable" as Prisma.TransactionIsolationLevel },
    ),
  );

  return {
    id: result.id,
    number: result.number,
    status: result.status,
    needsApproval: result.needsApproval,
    total: result.total.toString(),
    balanceDue: result.balanceDue.toString(),
  };
}

export type CancelOrderInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  id: string;
  reason: CancelReason;
  note?: string | null;
};

export async function cancelOrder(input: CancelOrderInput) {
  // Only OWNER / ADMIN cancel. SALES uses a separate request flow (P2-D).
  if (input.actorRole !== "OWNER" && input.actorRole !== "ADMIN") {
    throw new AppError("FORBIDDEN", "Only Owner or Admin can cancel orders.");
  }
  const before = await prisma.order.findFirst({
    where: { tenantId: input.tenantId, id: input.id },
    select: { id: true, status: true },
  });
  if (!before) throw new AppError("NOT_FOUND", "Order not found.");
  if (!canCancel(before.status)) {
    throw new AppError(
      "VALIDATION",
      "This order has already been dispatched or closed and cannot be cancelled.",
    );
  }
  assertTransition(before.status, "CANCELLED");

  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: input.id },
      data: {
        status: "CANCELLED",
        cancelReason: input.reason,
        cancelNote: input.note ?? null,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: input.id,
        actorId: input.actorId,
        type: "STATUS_CHANGE",
        fromStatus: before.status,
        toStatus: "CANCELLED",
        note: `${input.reason}${input.note ? ` — ${input.note}` : ""}`,
      },
    });
    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "ORDER_CANCEL",
      entity: "Order",
      entityId: input.id,
      before: { status: before.status },
      after: { status: "CANCELLED", reason: input.reason },
    });
    return updated;
  });
  return after;
}

// IST day boundaries for BR-11 checks.
function startOfISTDay(d: Date): Date {
  const istMillis = d.getTime() + (5 * 60 + 30) * 60 * 1000;
  const utcDay = new Date(istMillis);
  utcDay.setUTCHours(0, 0, 0, 0);
  return new Date(utcDay.getTime() - (5 * 60 + 30) * 60 * 1000);
}

// Retry wrapper for Postgres serialization failures (P2034) and deadlocks (P2028-ish).
// Jittered exponential backoff so concurrent callers don't retry in lockstep.
async function runWithSerializableRetry<T>(fn: () => Promise<T>, maxAttempts = 8): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const code = (e as { code?: string }).code;
      const message = (e as Error).message ?? "";
      const isConflict =
        code === "P2034" || // serialization failure / write conflict
        /serialization failure|write conflict|deadlock/i.test(message);
      if (!isConflict || attempt === maxAttempts) throw e;
      const baseMs = Math.min(50 * 2 ** (attempt - 1), 500);
      const jitter = Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, baseMs + jitter));
    }
  }
  throw lastErr;
}
