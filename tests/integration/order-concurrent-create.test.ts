// §17-P2 gate: "50 parallel order creates → 50 unique, gapless numbers for the
// same entity+FY." Proves the Serializable transaction around DocumentCounter
// (allocateCounter) in orderService.createOrder.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createOrder } from "@/server/services/orderService";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_REACHABLE =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_REACHABLE)("orderService.createOrder — concurrent counter (BR-04)", () => {
  const prisma = new PrismaClient();
  const slug = `test-ord-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let entityId = "";
  let entityCode = "";
  let customerId = "";
  let salespersonId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: "order-concurrent.test",
        settings: { create: {} },
      },
    });
    tenantId = tenant.id;
    entityCode = `T${Date.now().toString().slice(-5)}`;
    const entity = await prisma.billingEntity.create({
      data: { tenantId, code: entityCode, name: "Test Entity" },
    });
    entityId = entity.id;
    const sales = await prisma.user.create({
      data: {
        tenantId,
        authUserId: `${slug}:sales`,
        name: "Test Sales",
        phoneE164: "+919999999002",
        role: "SALES",
      },
    });
    salespersonId = sales.id;
    const customer = await prisma.customer.create({
      data: { tenantId, phoneE164: "+919999900001", name: "Concurrent Customer" },
    });
    customerId = customer.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.orderLine.deleteMany({ where: { order: { tenantId } } });
    await prisma.orderEvent.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.documentCounter.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  it("50 parallel creates emit 50 unique, gapless numbers in the same entity+FY", async () => {
    const orderDate = new Date();
    const promises = Array.from({ length: 50 }).map(() =>
      createOrder({
        tenantId,
        actorId: salespersonId,
        actorRole: "SALES",
        entityId,
        customerId,
        salespersonId,
        orderDate,
        lines: [
          {
            description: "Load test item",
            qty: 1,
            unitPrice: "1000",
            gstRate: "18",
          },
        ],
      }),
    );
    const results = await Promise.all(promises);

    const numbers = results.map((r) => r.number).sort();
    expect(new Set(numbers).size).toBe(50);

    // Extract the sequence tail from each "ENTITY/FY/SEQ" number and check they
    // are exactly 1..50 (gapless).
    const seqs = numbers.map((n) => Number(n.split("/").pop()));
    seqs.sort((a, b) => a - b);
    expect(seqs[0]).toBe(1);
    expect(seqs[seqs.length - 1]).toBe(50);
    for (let i = 1; i < seqs.length; i++) {
      expect(seqs[i]).toBe(seqs[i - 1]! + 1);
    }

    const dbCount = await prisma.order.count({ where: { tenantId } });
    expect(dbCount).toBe(50);
  }, 120_000);
});
