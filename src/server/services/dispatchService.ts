// Production → dispatch → delivery (§5.1, §5.3). Every transition writes an
// OrderEvent + audit row inside one transaction that holds the order row lock,
// so two people tapping "Dispatch" at once cannot over-ship a line.
import { prisma, type OrderStatus, type Prisma, type Role } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";
import { canTransition } from "@/server/domain/order/stateMachine";
import {
  applyDispatch,
  isFullyDelivered,
  remainingPicks,
  DispatchRuleError,
  type Pick,
} from "@/server/domain/dispatch/dispatch";
import { isPaidOnAllowed, isProofPathFor } from "@/server/domain/payment/record";
import { recomputeAndWriteBalance } from "@/server/services/paymentService";

type Actor = { tenantId: string; actorId: string; actorRole: Role };

const DISPATCH_ROLES: Role[] = ["OWNER", "ADMIN", "DISPATCH"];
export const MAX_DISPATCH_PHOTOS = 4;

function assertDispatchRole(role: Role) {
  if (!DISPATCH_ROLES.includes(role)) {
    throw new AppError("FORBIDDEN", "Only Owner, Admin or Dispatch can update production and dispatch.");
  }
}

async function lockOrder(tx: Prisma.TransactionClient, tenantId: string, orderId: string) {
  // Row lock: serialises concurrent dispatch/status changes on the same order.
  await tx.$executeRaw`SELECT 1 FROM "Order" WHERE id = ${orderId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const order = await tx.order.findFirst({
    where: { tenantId, id: orderId },
    select: {
      id: true,
      number: true,
      status: true,
      lines: { select: { id: true, qty: true, dispatchedQty: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!order) throw new AppError("NOT_FOUND", "Order not found.");
  return order;
}

async function changeStatus(
  tx: Prisma.TransactionClient,
  a: Actor,
  order: { id: string; status: OrderStatus },
  to: OrderStatus,
  note: string | null,
) {
  if (!canTransition(order.status, to)) {
    throw new AppError("VALIDATION", `This order is ${order.status.replace(/_/g, " ").toLowerCase()} — it can't move to ${to.replace(/_/g, " ").toLowerCase()}.`);
  }
  await tx.order.update({ where: { id: order.id }, data: { status: to } });
  await tx.orderEvent.create({
    data: { orderId: order.id, actorId: a.actorId, type: "STATUS_CHANGE", fromStatus: order.status, toStatus: to, note },
  });
  await writeAudit(tx, {
    tenantId: a.tenantId,
    actorId: a.actorId,
    action: "ORDER_STATUS",
    entity: "Order",
    entityId: order.id,
    before: { status: order.status },
    after: { status: to },
  });
}

/** CONFIRMED → IN_PRODUCTION ("Start"). */
export async function startProduction(input: Actor & { orderId: string }) {
  assertDispatchRole(input.actorRole);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.tenantId, input.orderId);
    await changeStatus(tx, input, order, "IN_PRODUCTION", null);
    return { id: order.id, status: "IN_PRODUCTION" as const };
  });
}

/** IN_PRODUCTION → READY ("Mark ready"). */
export async function markReady(input: Actor & { orderId: string }) {
  assertDispatchRole(input.actorRole);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.tenantId, input.orderId);
    await changeStatus(tx, input, order, "READY", null);
    return { id: order.id, status: "READY" as const };
  });
}

export type CreateDispatchInput = Actor & {
  orderId: string;
  picks: Pick[];
  dispatchedOn: Date;
  transporter?: string | null;
  lrNumber?: string | null;
  vehicleNo?: string | null;
  photoPaths?: string[];
  note?: string | null;
};

/** READY / PARTIALLY_DISPATCHED → PARTIALLY_DISPATCHED | DISPATCHED (§5.3, per line + qty). */
export async function createDispatch(input: CreateDispatchInput) {
  assertDispatchRole(input.actorRole);
  if (!isPaidOnAllowed(input.dispatchedOn, new Date())) {
    throw new AppError("VALIDATION", "Dispatch date cannot be in the future.");
  }
  const photos = input.photoPaths ?? [];
  if (photos.length > MAX_DISPATCH_PHOTOS) {
    throw new AppError("VALIDATION", `At most ${MAX_DISPATCH_PHOTOS} photos per dispatch.`);
  }
  if (photos.some((p) => !isProofPathFor(p, input.tenantId, input.orderId))) {
    throw new AppError("VALIDATION", "Photo upload does not belong to this order.");
  }

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.tenantId, input.orderId);
    if (order.status !== "READY" && order.status !== "PARTIALLY_DISPATCHED") {
      throw new AppError("VALIDATION", "Only orders marked ready can be dispatched.");
    }
    let result: ReturnType<typeof applyDispatch>;
    try {
      result = applyDispatch(order.lines, input.picks);
    } catch (e) {
      if (e instanceof DispatchRuleError) throw new AppError("VALIDATION", e.message);
      throw e;
    }

    const chosen = input.picks.filter((p) => p.qty > 0);
    const dispatch = await tx.dispatch.create({
      data: {
        orderId: order.id,
        dispatchedOn: input.dispatchedOn,
        transporter: input.transporter?.trim() || null,
        lrNumber: input.lrNumber?.trim() || null,
        vehicleNo: input.vehicleNo?.trim() || null,
        photoPaths: photos,
        note: input.note?.trim() || null,
        createdById: input.actorId,
        lines: { create: chosen.map((p) => ({ orderLineId: p.orderLineId, qty: p.qty })) },
      },
    });
    for (const p of chosen) {
      await tx.orderLine.update({
        where: { id: p.orderLineId },
        data: { dispatchedQty: result.dispatched.get(p.orderLineId)! },
      });
    }
    const shipped = chosen.reduce((s, p) => s + p.qty, 0);
    const summary = [`${shipped} machine${shipped === 1 ? "" : "s"}`, input.transporter?.trim(), input.lrNumber?.trim() && `LR ${input.lrNumber.trim()}`]
      .filter(Boolean)
      .join(" · ");
    if (result.status !== order.status) {
      await changeStatus(tx, input, order, result.status, `Dispatched ${summary}`);
    } else {
      await tx.orderEvent.create({
        data: { orderId: order.id, actorId: input.actorId, type: "DISPATCH", note: `Dispatched ${summary}` },
      });
    }
    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "DISPATCH_CREATE",
      entity: "Dispatch",
      entityId: dispatch.id,
      after: { orderNumber: order.number, picks: chosen, status: result.status },
    });
    return { dispatchId: dispatch.id, status: result.status };
  });
}

/**
 * Confirms one dispatch reached the customer. When every machine has shipped
 * and every dispatch is delivered, the order moves DISPATCHED → DELIVERED and
 * the balance is recomputed — which auto-closes a fully paid order (§5.1).
 */
export async function markDelivered(
  input: Actor & { dispatchId: string; deliveredOn: Date; proofPath?: string | null },
) {
  assertDispatchRole(input.actorRole);
  if (!isPaidOnAllowed(input.deliveredOn, new Date())) {
    throw new AppError("VALIDATION", "Delivery date cannot be in the future.");
  }
  return prisma.$transaction(async (tx) => {
    const d = await tx.dispatch.findFirst({
      where: { id: input.dispatchId, order: { tenantId: input.tenantId } },
      select: { id: true, orderId: true, deliveredOn: true, dispatchedOn: true },
    });
    if (!d) throw new AppError("NOT_FOUND", "Dispatch not found.");
    if (input.proofPath && !isProofPathFor(input.proofPath, input.tenantId, d.orderId)) {
      throw new AppError("VALIDATION", "Photo upload does not belong to this order.");
    }
    const order = await lockOrder(tx, input.tenantId, d.orderId);
    if (d.deliveredOn) throw new AppError("VALIDATION", "This dispatch is already marked delivered.");
    if (input.deliveredOn.getTime() < d.dispatchedOn.getTime()) {
      throw new AppError("VALIDATION", "Delivery can't be before the dispatch date.");
    }

    await tx.dispatch.update({
      where: { id: d.id },
      data: { deliveredOn: input.deliveredOn, deliveryProofPath: input.proofPath ?? null },
    });
    const all = await tx.dispatch.findMany({ where: { orderId: order.id }, select: { deliveredOn: true } });
    const delivered = isFullyDelivered(order.lines, all.map((x) => ({ delivered: Boolean(x.deliveredOn) })));
    if (delivered) {
      await changeStatus(tx, input, order, "DELIVERED", null);
      await recomputeAndWriteBalance(tx, order.id);
    } else {
      await tx.orderEvent.create({
        data: { orderId: order.id, actorId: input.actorId, type: "DELIVERY", note: "Part delivery confirmed" },
      });
    }
    const after = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    return { orderId: order.id, status: after.status };
  });
}

/**
 * Stock items (§5.1): CONFIRMED → DELIVERED in one tap. Logs a dispatch of
 * every line plus delivery with today's date, then recomputes the balance.
 */
export async function handOverNow(input: Actor & { orderId: string; today: Date }) {
  assertDispatchRole(input.actorRole);
  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.tenantId, input.orderId);
    if (order.status !== "CONFIRMED") {
      throw new AppError("VALIDATION", "Hand-over is only for confirmed stock orders.");
    }
    const picks = remainingPicks(order.lines);
    await tx.dispatch.create({
      data: {
        orderId: order.id,
        dispatchedOn: input.today,
        deliveredOn: input.today,
        note: "Handed over at the counter",
        createdById: input.actorId,
        lines: { create: picks.map((p) => ({ orderLineId: p.orderLineId, qty: p.qty })) },
      },
    });
    for (const l of order.lines) {
      await tx.orderLine.update({ where: { id: l.id }, data: { dispatchedQty: l.qty } });
    }
    await changeStatus(tx, input, order, "DELIVERED", "Handed over now");
    await recomputeAndWriteBalance(tx, order.id);
    const after = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true } });
    return { orderId: order.id, status: after.status };
  });
}
