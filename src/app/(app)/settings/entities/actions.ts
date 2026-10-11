"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { updateEntity } from "@/server/services/entityService";

const UpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(80).optional(),
  gstin: z.string().max(15).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  active: z.boolean().optional(),
});

export const updateEntityAction = makeServerAction({
  input: UpdateInput,
  action: "settings.manage",
  revalidate: "/settings/entities",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await updateEntity({
      tenantId: session.tenantId,
      actorId: session.userId,
      id: parsed.id,
      name: parsed.name,
      gstin: parsed.gstin ?? null,
      address: parsed.address ?? null,
      phone: parsed.phone ?? null,
      active: parsed.active,
    });
    return { id: row.id };
  },
});
