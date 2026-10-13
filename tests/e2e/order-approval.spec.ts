// §5.6 price-approval flow — Admin opens a PENDING_APPROVAL order and approves.
// Seeds the pending order via Prisma so the test is independent of the wizard.
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = process.env.SEED_PASSWORD_ADMIN ?? "";
const DB_READY =
  Boolean(process.env.DATABASE_URL) && /:55433\b/.test(process.env.DATABASE_URL ?? "");

test.describe("Order detail — Admin approves a below-floor order", () => {
  test.skip(!PASSWORD || !DB_READY, "Set SEED_PASSWORD_ADMIN + local Supabase stack to run");

  const prisma = new PrismaClient();
  let orderId = "";

  test.beforeEach(async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "ki-kfm-pilot" } });
    if (!tenant) throw new Error("seeded tenant missing");

    const sales = await prisma.user.findFirst({
      where: { tenantId: tenant.id, phoneE164: "+919840000013" }, // Viji
    });
    const entity = await prisma.billingEntity.findFirst({
      where: { tenantId: tenant.id, code: "KI" },
    });
    const customer = await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        phoneE164: `+919${Date.now().toString().slice(-9)}`,
        name: "E2E Approval Target",
      },
    });

    // Seed one PENDING_APPROVAL order (below-floor) via a direct Prisma create.
    const counter = await prisma.documentCounter.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: `ORDER:KI:26-27` } },
      create: { tenantId: tenant.id, key: `ORDER:KI:26-27`, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const number = `KI/26-27/${String(counter.value).padStart(4, "0")}`;

    const created = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        number,
        entityId: entity!.id,
        customerId: customer.id,
        salespersonId: sales!.id,
        orderDate: new Date(),
        status: "PENDING_APPROVAL",
        subtotal: "25000",
        chargesTotal: "0",
        discount: "0",
        total: "25000",
        balanceDue: "25000",
        needsApproval: true,
        createdById: sales!.id,
        lines: {
          create: [
            {
              description: "Below-floor item",
              qty: 1,
              listPrice: "32000",
              floorPrice: "28000",
              unitPrice: "25000",
              gstRate: "18",
              lineTotal: "25000",
            },
          ],
        },
        events: {
          create: [
            {
              actorId: sales!.id,
              type: "STATUS_CHANGE",
              toStatus: "PENDING_APPROVAL",
              note: "Pending price approval",
            },
          ],
        },
      },
      select: { id: true },
    });
    orderId = created.id;
  });

  test.afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: orderId } }).catch(() => undefined);
    await prisma.orderEvent.deleteMany({ where: { orderId } }).catch(() => undefined);
    await prisma.orderLine.deleteMany({ where: { orderId } }).catch(() => undefined);
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    if (order) {
      await prisma.customer.delete({ where: { id: order.customerId } }).catch(() => undefined);
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("admin approves and the order moves to CONFIRMED", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Approvals are admin-facing (desktop-first)");

    await page.goto("/login");
    await page.getByLabel("Mobile number").fill("9840000002"); // Office Admin
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard|payments)$/);

    await page.goto(`/orders/${orderId}`);
    await expect(page.getByText(/price approval needed/i)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/order-detail-pending.png`, fullPage: true });

    await page.getByRole("button", { name: /^approve$/i }).click();
    // Toast + revalidated detail page.
    await expect(page.getByText(/approved\.?$/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/price approval needed/i)).not.toBeVisible();
    await expect(page.getByText("Confirmed")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/order-detail-approved.png`, fullPage: true });
  });
});
