// Integration test — requires DATABASE_URL pointing at a reachable Postgres
// (the local Supabase CLI stack, or testcontainers in CI once wired up).
//
// Proves BR-07: concurrent createCustomerByPhone calls with the same phone
// resolve to a single Customer row (DB-level unique constraint prevents dupes).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { upsertCustomerByPhone, mergeCustomers } from "@/server/services/customerService";

// Pull env from .env.local (dev stack) when running outside pnpm scripts.
config({ path: ".env.local" });
config({ path: ".env" });

// Opt-in: run only when DATABASE_URL points at the local Supabase CLI stack
// (port 55433 — see supabase/config.toml) or when SB_INTEGRATION_TESTS=1 is
// explicitly set. CI uses a placeholder `localhost:5432` that must NOT match.
const DB_REACHABLE =
  Boolean(process.env.DATABASE_URL) &&
  (/:55433\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_REACHABLE)("customerService — concurrent + merge (DB-backed)", () => {
  const prisma = new PrismaClient();
  const tenantPrefix = `test-upsert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let actorId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { slug: tenantPrefix, name: "customer-upsert.test" },
    });
    tenantId = tenant.id;
    const user = await prisma.user.create({
      data: {
        tenantId,
        authUserId: `${tenantPrefix}:actor`,
        name: "Test Actor",
        phoneE164: "+919999999001",
        role: "ADMIN",
      },
    });
    actorId = user.id;
  }, 30_000);

  afterAll(async () => {
    // Cascade manually since schema doesn't declare ON DELETE CASCADE everywhere.
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 30_000);

  beforeEach(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
  });

  it("BR-07: 10 concurrent creates with the same phone produce exactly one Customer row", async () => {
    const phone = "+919876543210";
    const promises = Array.from({ length: 10 }).map((_, i) =>
      upsertCustomerByPhone({
        tenantId,
        actorId,
        phoneE164: phone,
        name: `Caller ${i}`,
      }),
    );
    const results = await Promise.all(promises);

    const uniqueIds = new Set(results.map((r) => r.customer.id));
    expect(uniqueIds.size).toBe(1);

    const createdCount = results.filter((r) => r.created).length;
    // At most one call perceives itself as the creator — the other 9 are reads of the existing row.
    expect(createdCount).toBeLessThanOrEqual(1);

    const row = await prisma.customer.findUnique({
      where: { tenantId_phoneE164: { tenantId, phoneE164: phone } },
    });
    expect(row).not.toBeNull();
    expect(row!.phoneE164).toBe(phone);
  }, 30_000);

  it("merge moves orders + leaves source row as a soft-deleted history entry", async () => {
    // Set up two customers in this tenant with distinct phones.
    const source = await prisma.customer.create({
      data: {
        tenantId,
        phoneE164: "+919000000111",
        name: "Dup Record",
      },
    });
    const survivor = await prisma.customer.create({
      data: {
        tenantId,
        phoneE164: "+919000000222",
        name: "Primary Record",
      },
    });

    // Create a dummy order owned by the source so the move is observable.
    const entity = await prisma.billingEntity.create({
      data: { tenantId, code: "ZZ", name: "Z Test" },
    });
    await prisma.order.create({
      data: {
        tenantId,
        number: `${tenantPrefix}/ZZ/0001`,
        entityId: entity.id,
        customerId: source.id,
        salespersonId: actorId,
        orderDate: new Date(),
        subtotal: 1000,
        total: 1000,
        balanceDue: 1000,
        createdById: actorId,
      },
    });

    const result = await mergeCustomers({
      tenantId,
      actorId,
      sourceId: source.id,
      survivorId: survivor.id,
    });

    expect(result.ordersMoved).toBe(1);

    const after = await prisma.customer.findUnique({ where: { id: source.id } });
    expect(after?.mergedIntoId).toBe(survivor.id);
    expect(after?.mergedAt).toBeInstanceOf(Date);

    const movedOrders = await prisma.order.findMany({
      where: { tenantId, customerId: survivor.id },
    });
    expect(movedOrders).toHaveLength(1);

    const audit = await prisma.auditLog.findFirst({
      where: { tenantId, entity: "Customer", entityId: source.id, action: "CUSTOMER_MERGE" },
    });
    expect(audit).not.toBeNull();
    // Cleanup handled by beforeEach of the next iteration.
  }, 30_000);

  it("merge throws when source and survivor are the same", async () => {
    const c = await prisma.customer.create({
      data: { tenantId, phoneE164: "+919000000333", name: "Only" },
    });
    await expect(
      mergeCustomers({
        tenantId,
        actorId,
        sourceId: c.id,
        survivorId: c.id,
      }),
    ).rejects.toThrow(/different customers/i);
  });
});
