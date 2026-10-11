"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { setTarget } from "@/server/services/targetService";

const SetTargetInput = z.object({
  userId: z.string(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM")
    .transform((v) => {
      const [y, m] = v.split("-").map(Number) as [number, number];
      return new Date(Date.UTC(y, m - 1, 1));
    }),
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? v.replace(/,/g, "") : String(v))),
});

export const setTargetAction = makeServerAction({
  input: SetTargetInput,
  action: "targets.set",
  revalidate: "/settings/targets",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    await setTarget({
      tenantId: session.tenantId,
      actorId: session.userId,
      userId: parsed.userId,
      month: parsed.month,
      amount: parsed.amount,
    });
    return { ok: true as const };
  },
});
