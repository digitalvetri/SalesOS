"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { createAccount, updateAccount } from "@/server/services/accountService";

const KindSchema = z.enum(["BANK", "UPI", "CASH_DRAWER"]);

const CreateInput = z.object({
  entityId: z.string(),
  label: z.string().min(1).max(80),
  kind: KindSchema,
  last4: z.string().regex(/^\d{4}$/).nullable().optional(),
});

export const createAccountAction = makeServerAction({
  input: CreateInput,
  action: "settings.manage",
  revalidate: "/settings/accounts",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await createAccount({
      tenantId: session.tenantId,
      actorId: session.userId,
      entityId: parsed.entityId,
      label: parsed.label,
      kind: parsed.kind,
      last4: parsed.last4 ?? null,
    });
    return { id: row.id };
  },
});

const UpdateInput = z.object({
  id: z.string(),
  label: z.string().min(1).max(80).optional(),
  last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  active: z.boolean().optional(),
});

export const updateAccountAction = makeServerAction({
  input: UpdateInput,
  action: "settings.manage",
  revalidate: "/settings/accounts",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await updateAccount({
      tenantId: session.tenantId,
      actorId: session.userId,
      id: parsed.id,
      label: parsed.label,
      last4: parsed.last4,
      active: parsed.active,
    });
    return { id: row.id };
  },
});
