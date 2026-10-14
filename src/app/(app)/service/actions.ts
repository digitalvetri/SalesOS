"use server";
// Service requests (spec §5) — thin Zod + permission wrappers around
// src/server/services/serviceRequestService.ts.
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { createServiceRequest, setServiceStatus } from "@/server/services/serviceRequestService";

const REVALIDATE = ["/service", "/dashboard", "/home", "/production"];

const optText = (max: number) => z.string().max(max).nullable().optional();

const CreateInput = z.object({
  customerName: z.string().max(120),
  phone: z.string().max(20),
  address: optText(500),
  product: optText(200),
  complaint: z.string().max(2000),
  serviceType: z.enum(["FREE", "PAID"]),
  notes: optText(1000),
});

export const createServiceRequestAction = makeServerAction({
  input: CreateInput,
  action: "service.create",
  revalidate: REVALIDATE,
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    // createServiceRequest re-validates and throws a VALIDATION AppError with the user-facing message.
    const sr = await createServiceRequest({ tenantId: session.tenantId, actorId: session.userId }, parsed);
    return { id: sr.id, number: sr.number };
  },
});

export const setServiceStatusAction = makeServerAction({
  input: z.object({ id: z.string().min(1).max(64), status: z.enum(["PENDING", "DONE"]) }),
  action: "service.update",
  revalidate: REVALIDATE,
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const sr = await setServiceStatus(
      { tenantId: session.tenantId, actorId: session.userId, actorRole: session.role },
      parsed.id,
      parsed.status,
    );
    return { id: sr.id, number: sr.number, status: sr.status };
  },
});
