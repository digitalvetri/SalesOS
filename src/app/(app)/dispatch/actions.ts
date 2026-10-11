"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import {
  startProduction,
  markReady,
  createDispatch,
  markDelivered,
  handOverNow,
} from "@/server/services/dispatchService";

// §4.2 "Update production/dispatch status": Owner, Admin, Dispatch.
const BusinessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
const revalidate = ["/dispatch", "/orders", "/home"];

const OrderOnly = z.object({ orderId: z.string().min(1) });

export const startProductionAction = makeServerAction({
  input: OrderOnly,
  action: "dispatch.updateStatus",
  revalidate,
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return startProduction({ tenantId: s.tenantId, actorId: s.userId, actorRole: s.role, orderId: p.orderId });
  },
});

export const markReadyAction = makeServerAction({
  input: OrderOnly,
  action: "dispatch.updateStatus",
  revalidate,
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return markReady({ tenantId: s.tenantId, actorId: s.userId, actorRole: s.role, orderId: p.orderId });
  },
});

export const createDispatchAction = makeServerAction({
  input: z.object({
    orderId: z.string().min(1),
    picks: z.array(z.object({ orderLineId: z.string().min(1), qty: z.number().int().min(0) })).min(1).max(50),
    dispatchedOn: BusinessDate,
    transporter: z.string().trim().max(80).nullable().optional(),
    lrNumber: z.string().trim().max(40).nullable().optional(),
    vehicleNo: z.string().trim().max(20).nullable().optional(),
    photoPaths: z.array(z.string().max(300)).max(4).optional(),
    note: z.string().trim().max(400).nullable().optional(),
  }),
  action: "dispatch.updateStatus",
  revalidate,
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return createDispatch({
      tenantId: s.tenantId,
      actorId: s.userId,
      actorRole: s.role,
      orderId: p.orderId,
      picks: p.picks,
      dispatchedOn: toDate(p.dispatchedOn),
      transporter: p.transporter ?? null,
      lrNumber: p.lrNumber ?? null,
      vehicleNo: p.vehicleNo ?? null,
      photoPaths: p.photoPaths ?? [],
      note: p.note ?? null,
    });
  },
});

export const markDeliveredAction = makeServerAction({
  input: z.object({
    dispatchId: z.string().min(1),
    deliveredOn: BusinessDate,
    proofPath: z.string().max(300).nullable().optional(),
  }),
  action: "dispatch.updateStatus",
  revalidate,
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return markDelivered({
      tenantId: s.tenantId,
      actorId: s.userId,
      actorRole: s.role,
      dispatchId: p.dispatchId,
      deliveredOn: toDate(p.deliveredOn),
      proofPath: p.proofPath ?? null,
    });
  },
});

export const handOverNowAction = makeServerAction({
  input: z.object({ orderId: z.string().min(1), today: BusinessDate }),
  action: "dispatch.updateStatus",
  revalidate,
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    return handOverNow({ tenantId: s.tenantId, actorId: s.userId, actorRole: s.role, orderId: p.orderId, today: toDate(p.today) });
  },
});
