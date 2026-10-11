import { prisma, type AccountKind } from "./client";

export async function listAccounts(tenantId: string) {
  return prisma.account.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { entityId: "asc" }, { label: "asc" }],
    include: { entity: { select: { code: true, name: true } } },
  });
}

export async function getAccount(tenantId: string, id: string) {
  return prisma.account.findFirst({ where: { tenantId, id } });
}

export type AccountCreateInput = {
  tenantId: string;
  entityId: string;
  label: string;
  kind: AccountKind;
  last4?: string | null;
};
