import { prisma, type AccountKind } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";

export type CreateAccountInput = {
  tenantId: string;
  actorId: string;
  entityId: string;
  label: string;
  kind: AccountKind;
  last4?: string | null;
};

export async function createAccount(input: CreateAccountInput) {
  const entity = await prisma.billingEntity.findFirst({
    where: { tenantId: input.tenantId, id: input.entityId },
  });
  if (!entity) throw new AppError("NOT_FOUND", "Entity not found.");

  const row = await prisma.account.create({
    data: {
      tenantId: input.tenantId,
      entityId: input.entityId,
      label: input.label,
      kind: input.kind,
      last4: input.last4 ?? null,
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "ACCOUNT_CREATE",
    entity: "Account",
    entityId: row.id,
    after: { label: row.label, kind: row.kind, entityCode: entity.code },
  });

  return row;
}

export type UpdateAccountInput = {
  tenantId: string;
  actorId: string;
  id: string;
  label?: string;
  last4?: string | null;
  active?: boolean;
};

export async function updateAccount(input: UpdateAccountInput) {
  const before = await prisma.account.findFirst({
    where: { tenantId: input.tenantId, id: input.id },
  });
  if (!before) throw new AppError("NOT_FOUND", "Account not found.");

  const after = await prisma.account.update({
    where: { id: input.id },
    data: {
      ...(input.label !== undefined && { label: input.label }),
      ...(input.last4 !== undefined && { last4: input.last4 }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "ACCOUNT_UPDATE",
    entity: "Account",
    entityId: after.id,
    before: { label: before.label, last4: before.last4, active: before.active },
    after: { label: after.label, last4: after.last4, active: after.active },
  });

  return after;
}
