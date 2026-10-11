import { prisma } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";

export type UpdateEntityInput = {
  tenantId: string;
  actorId: string;
  id: string;
  name?: string;
  gstin?: string | null;
  address?: string | null;
  phone?: string | null;
  active?: boolean;
};

export async function updateEntity(input: UpdateEntityInput) {
  const before = await prisma.billingEntity.findFirst({
    where: { tenantId: input.tenantId, id: input.id },
  });
  if (!before) throw new AppError("NOT_FOUND", "Entity not found.");

  const after = await prisma.billingEntity.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.gstin !== undefined && { gstin: input.gstin }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "ENTITY_UPDATE",
    entity: "BillingEntity",
    entityId: after.id,
    before: {
      name: before.name,
      gstin: before.gstin,
      address: before.address,
      phone: before.phone,
      active: before.active,
    },
    after: {
      name: after.name,
      gstin: after.gstin,
      address: after.address,
      phone: after.phone,
      active: after.active,
    },
  });

  return after;
}
