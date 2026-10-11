"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { prisma } from "@/server/repo/client";
import type { Session } from "@/server/auth/session";
import { logContact, setPromisedPaymentDate } from "@/server/services/followUpService";
import { sendPaymentReminder } from "@/server/services/whatsappService";

// Follow-ups ride the "Record payment" permission row (§4.2): Sales on own
// orders, Owner/Admin/Accounts on all, Dispatch never.
async function ownsAll(orderIds: string[], session: Session | null) {
  if (!session) return { isOwn: false };
  const orders = await prisma.order.findMany({
    where: { tenantId: session.tenantId, id: { in: orderIds } },
    select: { salespersonId: true },
  });
  return { isOwn: orders.length > 0 && orders.every((o) => o.salespersonId === session.userId) };
}

const OrderIds = z.array(z.string().min(1)).min(1).max(50);

export const sendReminderAction = makeServerAction({
  input: z.object({ orderIds: OrderIds }),
  action: "payments.record",
  resolveOwnership: (p, s) => ownsAll(p.orderIds, s),
  revalidate: ["/collect", "/orders"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    // 48 h rule + FollowUp log, then Cloud API send or wa.me fallback (§13).
    return sendPaymentReminder({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      orderIds: parsed.orderIds,
    });
  },
});

export const logCallAction = makeServerAction({
  input: z.object({ orderIds: OrderIds, note: z.string().trim().max(400).nullable().optional() }),
  action: "payments.record",
  resolveOwnership: (p, s) => ownsAll(p.orderIds, s),
  revalidate: ["/collect", "/orders"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return logContact({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      orderIds: parsed.orderIds,
      channel: "CALL",
      note: parsed.note ?? null,
    });
  },
});

export const setPromiseDateAction = makeServerAction({
  input: z.object({
    orderId: z.string().min(1),
    promisedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    note: z.string().trim().max(400).nullable().optional(),
  }),
  action: "payments.record",
  resolveOwnership: (p, s) => ownsAll([p.orderId], s),
  revalidate: ["/collect", "/orders"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return setPromisedPaymentDate({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      orderId: parsed.orderId,
      promisedOn: parsed.promisedOn ? new Date(`${parsed.promisedOn}T00:00:00.000Z`) : null,
      note: parsed.note ?? null,
    });
  },
});
