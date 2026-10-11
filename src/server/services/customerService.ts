import { prisma, type CustomerType } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";

export type UpsertCustomerInput = {
  tenantId: string;
  actorId: string;
  phoneE164: string; // already normalized E.164
  name: string;
  businessName?: string | null;
  altPhone?: string | null;
  type?: CustomerType;
  city?: string | null;
  state?: string | null;
  gstin?: string | null;
  address?: string | null;
  notes?: string | null;
  ownerUserId?: string | null;
};

// Phone-first create (BR-07): a race between two parallel calls with the same
// phone resolves to a single row thanks to the (tenantId, phoneE164) unique
// constraint. If the row already exists and is active, we return the existing
// row untouched (idempotent). If it was merged, we follow the chain and return
// the survivor — callers see a stable customer id for that phone number.
export async function upsertCustomerByPhone(input: UpsertCustomerInput) {
  const existing = await prisma.customer.findUnique({
    where: {
      tenantId_phoneE164: { tenantId: input.tenantId, phoneE164: input.phoneE164 },
    },
  });

  if (existing) {
    // Walk the merge chain.
    let row = existing;
    for (let i = 0; i < 5 && row.mergedIntoId; i++) {
      const next = await prisma.customer.findFirst({
        where: { tenantId: input.tenantId, id: row.mergedIntoId },
      });
      if (!next) break;
      row = next;
    }
    return { customer: row, created: false as const };
  }

  try {
    const row = await prisma.customer.create({
      data: {
        tenantId: input.tenantId,
        phoneE164: input.phoneE164,
        name: input.name,
        businessName: input.businessName ?? null,
        altPhone: input.altPhone ?? null,
        type: input.type ?? "END_CUSTOMER",
        city: input.city ?? null,
        state: input.state ?? "Tamil Nadu",
        gstin: input.gstin ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        ownerUserId: input.ownerUserId ?? null,
      },
    });
    await writeAudit(prisma, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: "CUSTOMER_CREATE",
      entity: "Customer",
      entityId: row.id,
      after: { phoneE164: row.phoneE164, name: row.name, type: row.type },
    });
    return { customer: row, created: true as const };
  } catch (e) {
    // Unique-constraint race: another request won. Re-read and return.
    const raced = await prisma.customer.findUnique({
      where: {
        tenantId_phoneE164: { tenantId: input.tenantId, phoneE164: input.phoneE164 },
      },
    });
    if (raced) return { customer: raced, created: false as const };
    throw e;
  }
}

export type UpdateCustomerInput = {
  tenantId: string;
  actorId: string;
  id: string;
  name?: string;
  businessName?: string | null;
  altPhone?: string | null;
  type?: CustomerType;
  city?: string | null;
  state?: string | null;
  gstin?: string | null;
  address?: string | null;
  notes?: string | null;
};

export async function updateCustomer(input: UpdateCustomerInput) {
  const before = await prisma.customer.findFirst({
    where: { tenantId: input.tenantId, id: input.id, mergedIntoId: null },
  });
  if (!before) throw new AppError("NOT_FOUND", "Customer not found.");

  const after = await prisma.customer.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.altPhone !== undefined && { altPhone: input.altPhone }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.state !== undefined && { state: input.state }),
      ...(input.gstin !== undefined && { gstin: input.gstin }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "CUSTOMER_UPDATE",
    entity: "Customer",
    entityId: after.id,
    before,
    after,
  });

  return after;
}

export type MergeCustomersInput = {
  tenantId: string;
  actorId: string;
  sourceId: string;
  survivorId: string;
};

export async function mergeCustomers(input: MergeCustomersInput) {
  if (input.sourceId === input.survivorId) {
    throw new AppError("VALIDATION", "Pick two different customers to merge.");
  }

  const [source, survivor] = await Promise.all([
    prisma.customer.findFirst({ where: { tenantId: input.tenantId, id: input.sourceId } }),
    prisma.customer.findFirst({ where: { tenantId: input.tenantId, id: input.survivorId } }),
  ]);
  if (!source || !survivor) throw new AppError("NOT_FOUND", "Customer not found.");
  if (source.mergedIntoId) {
    throw new AppError("CONFLICT", "Source customer is already merged.");
  }
  if (survivor.mergedIntoId) {
    throw new AppError("CONFLICT", "Survivor customer is already merged.");
  }

  const ordersMoved = await prisma.$transaction(async (tx) => {
    const n = await tx.order.updateMany({
      where: { tenantId: input.tenantId, customerId: input.sourceId },
      data: { customerId: input.survivorId },
    });

    await tx.customer.update({
      where: { id: input.sourceId },
      data: {
        mergedIntoId: input.survivorId,
        mergedAt: new Date(),
      },
    });

    return n.count;
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "CUSTOMER_MERGE",
    entity: "Customer",
    entityId: input.sourceId,
    before: { phoneE164: source.phoneE164, name: source.name },
    after: {
      mergedIntoId: input.survivorId,
      survivorPhoneE164: survivor.phoneE164,
      survivorName: survivor.name,
      ordersMoved,
    },
  });

  return { ordersMoved };
}
