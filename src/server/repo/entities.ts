import { prisma } from "./client";

export async function listEntities(tenantId: string) {
  return prisma.billingEntity.findMany({
    where: { tenantId },
    orderBy: { code: "asc" },
    include: { _count: { select: { accounts: true } } },
  });
}

export async function getEntity(tenantId: string, id: string) {
  return prisma.billingEntity.findFirst({ where: { tenantId, id } });
}
