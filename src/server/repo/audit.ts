// AuditLog write helper (spec BR-13).
// Every mutation writes AuditLog { actorId, action, entity, entityId, before, after, at }.
import { prisma, type Prisma } from "./client";

export type AuditInput = {
  tenantId: string;
  actorId: string;
  action: string; // e.g. "USER_CREATE", "ENTITY_UPDATE", "TARGET_SET"
  entity: string; // model name
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
};

export async function writeAudit(
  tx: Prisma.TransactionClient | typeof prisma,
  input: AuditInput,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before as Prisma.InputJsonValue | undefined,
      after: input.after as Prisma.InputJsonValue | undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}
