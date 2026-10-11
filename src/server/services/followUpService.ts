// Follow-ups & promised payment dates (§5.4). Every reminder, call and promise
// is a FollowUp row (channel, by whom, when, note) on the order it concerns.
import { prisma, type FollowUpChannel, type Role } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";
import { istDateString } from "@/server/domain/payment/record";
import { reminderAvailableAt } from "@/server/domain/payment/collect";

type Actor = { tenantId: string; actorId: string; actorRole: Role };

const COLLECTOR_ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTS", "SALES"];

async function loadOwnedOrders(input: Actor & { orderIds: string[] }) {
  if (!COLLECTOR_ROLES.includes(input.actorRole)) {
    throw new AppError("FORBIDDEN", "You cannot log follow-ups.");
  }
  const ids = Array.from(new Set(input.orderIds));
  if (ids.length === 0) throw new AppError("VALIDATION", "Pick at least one order.");
  const orders = await prisma.order.findMany({
    where: { tenantId: input.tenantId, id: { in: ids } },
    select: { id: true, number: true, salespersonId: true, status: true },
  });
  if (orders.length !== ids.length) throw new AppError("NOT_FOUND", "Order not found.");
  if (input.actorRole === "SALES" && orders.some((o) => o.salespersonId !== input.actorId)) {
    throw new AppError("FORBIDDEN", "Sales can only follow up on their own orders.");
  }
  return orders;
}

/**
 * Logs a WhatsApp payment reminder (deep-link fallback, §13) for each order.
 * Enforces §13 "max 1 reminder per order per 48 h" server-side: if any order
 * was reminded inside the window, nothing is logged.
 */
export async function logReminder(input: Actor & { orderIds: string[]; now?: Date }) {
  const orders = await loadOwnedOrders(input);
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    const recent = await tx.followUp.findMany({
      where: { orderId: { in: orders.map((o) => o.id) }, channel: "WHATSAPP" },
      orderBy: { at: "desc" },
      distinct: ["orderId"],
      select: { orderId: true, at: true },
    });
    for (const r of recent) {
      const nextAt = reminderAvailableAt(r.at, now);
      if (nextAt) {
        const number = orders.find((o) => o.id === r.orderId)!.number;
        const when = nextAt.toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        });
        throw new AppError("CONFLICT", `${number} was reminded in the last 48 hours — next reminder after ${when}.`, {
          orderId: r.orderId,
          nextAt: nextAt.toISOString(),
        });
      }
    }

    await tx.followUp.createMany({
      data: orders.map((o) => ({
        orderId: o.id,
        channel: "WHATSAPP" as const,
        note: "Payment reminder (WhatsApp)",
        byUserId: input.actorId,
        at: now,
      })),
    });
    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "FOLLOWUP_REMINDER",
      entity: "Order",
      entityId: orders[0]!.id,
      after: { orderIds: orders.map((o) => o.id) },
    });
    return { count: orders.length };
  });
}

/** Logs a call / visit / other contact (no cooldown). */
export async function logContact(
  input: Actor & { orderIds: string[]; channel: Exclude<FollowUpChannel, "WHATSAPP">; note?: string | null },
) {
  const orders = await loadOwnedOrders(input);
  await prisma.followUp.createMany({
    data: orders.map((o) => ({
      orderId: o.id,
      channel: input.channel,
      note: input.note?.trim() || null,
      byUserId: input.actorId,
    })),
  });
  return { count: orders.length };
}

/** Sets (or clears) the promised payment date on an order and logs it. */
export async function setPromisedPaymentDate(
  input: Actor & { orderId: string; promisedOn: Date | null; note?: string | null; now?: Date },
) {
  const [order] = await loadOwnedOrders({ ...input, orderIds: [input.orderId] });
  const today = istDateString(input.now ?? new Date());
  const promised = input.promisedOn ? input.promisedOn.toISOString().slice(0, 10) : null;
  if (promised && promised < today) {
    throw new AppError("VALIDATION", "A promised date cannot be in the past.");
  }
  if (order!.status === "CANCELLED" || order!.status === "CLOSED") {
    throw new AppError("VALIDATION", "Nothing to collect on this order.");
  }
  const note = input.note?.trim() || null;

  return prisma.$transaction(async (tx) => {
    const before = await tx.order.findUniqueOrThrow({
      where: { id: order!.id },
      select: { promisedPaymentDate: true },
    });
    await tx.order.update({
      where: { id: order!.id },
      data: { promisedPaymentDate: input.promisedOn },
    });
    const label = promised ? `Payment promised by ${promised}` : "Promised payment date cleared";
    await tx.followUp.create({
      data: {
        orderId: order!.id,
        channel: "OTHER",
        note: note ? `${label} — ${note}` : label,
        nextOn: input.promisedOn,
        byUserId: input.actorId,
      },
    });
    await tx.orderEvent.create({
      data: { orderId: order!.id, actorId: input.actorId, type: "NOTE", note: note ? `${label} — ${note}` : label },
    });
    await writeAudit(tx, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "ORDER_PROMISE_DATE",
      entity: "Order",
      entityId: order!.id,
      before: { promisedPaymentDate: before.promisedPaymentDate },
      after: { promisedPaymentDate: input.promisedOn },
    });
    return { id: order!.id, promisedPaymentDate: promised };
  });
}
