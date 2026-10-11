"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { adminSetTarget } from "@/server/services/employeeDetailService";
import { writeAudit } from "@/server/repo/audit";
import { prisma } from "@/server/repo/client";

const SetTargetInput = z.object({
  userId: z.string(),
  monthYm: z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
  amount: z.string(),
});

export const setTargetAction = makeServerAction({
  input: SetTargetInput,
  action: "targets.set",
  revalidate: "/employees",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await adminSetTarget({
      tenantId: session.tenantId,
      actorId: session.userId,
      userId: parsed.userId,
      monthYm: parsed.monthYm,
      amount: parsed.amount,
    });
    await writeAudit(prisma, {
      tenantId: session.tenantId,
      actorId: session.userId,
      action: "TARGET_SET",
      entity: "SalesTarget",
      entityId: row.id,
      after: { userId: parsed.userId, monthYm: parsed.monthYm, amount: parsed.amount },
    });
    return { id: row.id };
  },
});
