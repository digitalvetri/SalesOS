// v1.1 S3 gate — 50 parallel createOrderV2 calls for the same salesperson emit
// 50 unique, sequential S.Nos (1..50) thanks to the Serializable transaction
// around the DocumentCounter["SNO:<userId>"] row.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createOrderV2 } from "@/server/services/orderV2Service";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_REACHABLE =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_REACHABLE)(
  "createOrderV2 — concurrent S.No allocation",
  () => {
    const prisma = new PrismaClient();
    const slug = `test-ordv2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let tenantId = "";
    let salespersonId = "";

    beforeAll(async () => {
      const tenant = await prisma.tenant.create({
        data: { slug, name: "order-v2-concurrent.test", settings: { create: {} } },
      });
      tenantId = tenant.id;
      await prisma.billingEntity.create({
        data: { tenantId, code: `V${Date.now().toString().slice(-5)}`, name: "V2 Entity" },
      });
      const sales = await prisma.user.create({
        data: {
          tenantId,
          authUserId: `${slug}:sales`,
          name: "V2 Sales",
          phoneE164: "+919999900050",
          role: "SALES",
        },
      });
      salespersonId = sales.id;
    }, 60_000);

    afterAll(async () => {
      await prisma.auditLog.deleteMany({ where: { tenantId } });
      await prisma.payment.deleteMany({ where: { tenantId } });
      await prisma.order.deleteMany({ where: { tenantId } });
      await prisma.documentCounter.deleteMany({ where: { tenantId } });
      await prisma.customer.deleteMany({ where: { tenantId } });
      await prisma.user.deleteMany({ where: { tenantId } });
      await prisma.billingEntity.deleteMany({ where: { tenantId } });
      await prisma.tenantSettings
        .delete({ where: { tenantId } })
        .catch(() => undefined);
      await prisma.tenant.delete({ where: { id: tenantId } });
      await prisma.$disconnect();
    }, 60_000);

    it("50 parallel creates emit 50 unique, sequential S.Nos", async () => {
      const promises = Array.from({ length: 50 }).map((_, i) =>
        createOrderV2({
          tenantId,
          actorId: salespersonId,
          salespersonId,
          productText: `v2 load item #${i + 1}`,
          // 50 distinct customers so uniqueness isn't a confounding variable
          contactPhone: `+91999999${String(10000 + i).padStart(5, "0")}`,
          customerName: `Customer ${i + 1}`,
          total: "1000",
        }),
      );
      const results = await Promise.all(promises);

      const serials = results.map((r) => r.order.serialNo!).sort((a, b) => a - b);
      expect(new Set(serials).size).toBe(50);
      expect(serials[0]).toBe(1);
      expect(serials[49]).toBe(50);
      for (let i = 1; i < serials.length; i++) {
        expect(serials[i]).toBe(serials[i - 1]! + 1);
      }

      const dbCount = await prisma.order.count({
        where: { tenantId, salespersonId },
      });
      expect(dbCount).toBe(50);
    }, 120_000);
  },
);
