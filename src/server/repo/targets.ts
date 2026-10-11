import Decimal from "decimal.js";
import { prisma, type Prisma } from "./client";

export type TargetRow = {
  userId: string;
  month: Date; // first-of-month in IST
  amount: Prisma.Decimal;
};

export async function listTargets(tenantId: string, months: Date[]): Promise<TargetRow[]> {
  if (months.length === 0) return [];
  return prisma.salesTarget.findMany({
    where: { tenantId, month: { in: months } },
    select: { userId: true, month: true, amount: true },
  });
}

export async function upsertTarget(opts: {
  tenantId: string;
  userId: string;
  month: Date;
  amount: Decimal.Value;
}): Promise<void> {
  await prisma.salesTarget.upsert({
    where: {
      tenantId_userId_month: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        month: opts.month,
      },
    },
    update: { amount: new Decimal(opts.amount).toString() },
    create: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      month: opts.month,
      amount: new Decimal(opts.amount).toString(),
    },
  });
}
