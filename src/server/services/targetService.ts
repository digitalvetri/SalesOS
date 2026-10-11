import Decimal from "decimal.js";
import { prisma } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";

export type SetTargetInput = {
  tenantId: string;
  actorId: string;
  userId: string;
  month: Date; // first-of-month, IST
  amount: Decimal.Value;
};

export async function setTarget(input: SetTargetInput) {
  const user = await prisma.user.findFirst({
    where: { tenantId: input.tenantId, id: input.userId, role: "SALES" },
  });
  if (!user) throw new AppError("NOT_FOUND", "Salesperson not found.");

  const amount = new Decimal(input.amount);
  if (amount.isNegative()) {
    throw new AppError("VALIDATION", "Target must be zero or positive.");
  }

  const before = await prisma.salesTarget.findUnique({
    where: {
      tenantId_userId_month: {
        tenantId: input.tenantId,
        userId: input.userId,
        month: input.month,
      },
    },
  });

  const after = await prisma.salesTarget.upsert({
    where: {
      tenantId_userId_month: {
        tenantId: input.tenantId,
        userId: input.userId,
        month: input.month,
      },
    },
    update: { amount: amount.toString() },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      month: input.month,
      amount: amount.toString(),
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "TARGET_SET",
    entity: "SalesTarget",
    entityId: after.id,
    before: before ? { amount: before.amount.toString() } : null,
    after: { userId: after.userId, month: after.month, amount: after.amount.toString() },
  });

  return after;
}
