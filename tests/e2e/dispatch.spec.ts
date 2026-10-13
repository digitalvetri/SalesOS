// §17-P4 gate E2E: partial dispatch → delivered → closed on the §11.10 board.
// A fully paid (verified) order goes Start → Mark ready → Dispatch 1 of 2
// (with a photo, WhatsApp offer) → Dispatch the rest → Delivered ×2 → CLOSED.
import { test, expect, devices } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = process.env.SEED_PASSWORD_DISPATCH ?? process.env.SEED_PASSWORD_ADMIN ?? "";
const DB_READY = Boolean(process.env.DATABASE_URL) && /:55433\b/.test(process.env.DATABASE_URL ?? "");
const PHOTO = "docs/evidence/screenshots/login-en.png";

test.describe("Dispatch board — partial dispatch → delivered → closed", () => {
  test.skip(!PASSWORD || !DB_READY, "Set SEED_PASSWORD_DISPATCH + local Supabase stack");

  const prisma = new PrismaClient();
  let orderId = "";
  let customerId = "";
  let number = "";

  test.beforeEach(async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "ki-kfm-pilot" } });
    const sales = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, phoneE164: "+919840000012" } });
    const entity = await prisma.billingEntity.findFirstOrThrow({ where: { tenantId: tenant.id, code: "KI" } });
    const account = await prisma.account.findFirstOrThrow({ where: { tenantId: tenant.id, entityId: entity.id } });
    const customer = await prisma.customer.create({
      data: { tenantId: tenant.id, phoneE164: `+919${Date.now().toString().slice(-9)}`, name: "Swaada Foods" },
    });
    customerId = customer.id;
    const counter = await prisma.documentCounter.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "ORDER:KI:26-27" } },
      create: { tenantId: tenant.id, key: "ORDER:KI:26-27", value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    number = `KI/26-27/${String(counter.value).padStart(4, "0")}`;
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id, number, entityId: entity.id, customerId: customer.id, salespersonId: sales.id,
        // Older than any demo-seed order (≤ 180 d) so it is the oldest stuck card and holds the gold.
        orderDate: new Date(Date.now() - 200 * 86_400_000), status: "CONFIRMED",
        promisedDeliveryDate: new Date(Date.now() - 2 * 86_400_000),
        subtotal: "60000", chargesTotal: "0", discount: "0", total: "60000", balanceDue: "0", createdById: sales.id,
        lines: { create: [
          { description: "10L Tilting Wet Grinder", qty: 2, unitPrice: "20000", gstRate: "18", lineTotal: "40000", sortOrder: 0 },
          { description: "Vada machine", qty: 1, unitPrice: "20000", gstRate: "18", lineTotal: "20000", sortOrder: 1 },
        ] },
        payments: { create: [{
          tenantId: tenant.id, receiptNo: `E2E-${Date.now()}`, type: "FINAL", method: "UPI", amount: "60000",
          paidOn: new Date(), receivedIntoAccountId: account.id, status: "VERIFIED", createdById: sales.id,
        }] },
      },
    });
    orderId = order.id;
  });

  test.afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { entityId: orderId } });
    const ds = await prisma.dispatch.findMany({ where: { orderId }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ds.map((d) => d.id) } } });
    await prisma.dispatchLine.deleteMany({ where: { dispatch: { orderId } } });
    await prisma.dispatch.deleteMany({ where: { orderId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.orderEvent.deleteMany({ where: { orderId } });
    await prisma.orderLine.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("workshop moves a stuck order to CLOSED", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Drives its own desktop + mobile contexts");
    const baseURL = testInfo.project.use.baseURL!;
    const usingDispatch = Boolean(process.env.SEED_PASSWORD_DISPATCH);
    const phone = usingDispatch ? "9840000021" : "9840000002";

    // Desktop board (Admin or Dispatch): columns + gold on the oldest overdue card.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL });
    await ctx.route(/https:\/\/wa\.me\/.*/, (r) => r.fulfill({ status: 200, body: "wa.me stub" }));
    const page = await ctx.newPage();
    await page.goto("/login");
    await page.getByLabel("Mobile number").fill(phone);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard|payments)$/);

    await page.goto("/dispatch");
    const card = page.getByTestId("board-card").filter({ hasText: number });
    await expect(card).toContainText("Swaada Foods");
    await expect(card).toContainText("(late)");
    await expect(card.getByRole("button", { name: "Start" })).toHaveAttribute("data-gold", "true");
    await page.screenshot({ path: `${SHOTS}/dispatch-board.png`, fullPage: true });
    // Money never reaches the board (visible content; the i18n bundle in the
    // page payload legitimately contains "₹" in unrelated labels).
    expect(await page.locator("main").innerText()).not.toMatch(/₹/);

    await card.getByRole("button", { name: "Start" }).click();
    await expect(page.getByText(`${number} is in production.`)).toBeVisible();
    await card.getByRole("button", { name: "Mark ready" }).click();
    await expect(page.getByText(`${number} is ready.`)).toBeVisible();

    // Partial dispatch: 1 of 2 grinders only, with a photo.
    await card.getByRole("button", { name: "Dispatch" }).click();
    const sheet = page.getByRole("dialog");
    const steppers = sheet.locator("li");
    await steppers.nth(0).getByRole("button").first().click(); // 2 → 1 grinder
    await steppers.nth(1).getByRole("button").first().click(); // 1 → 0 vada
    await sheet.getByLabel("Transporter").fill("ABT Parcel");
    await sheet.getByLabel("LR / docket no.").fill("88213");
    await sheet.locator('input[type="file"]').setInputFiles(PHOTO);
    await expect(sheet.getByText("1 of 4 photos added")).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("button", { name: "Dispatch 1 machine" }).click();
    // One-tap WhatsApp update offered in the success toast (§5.3).
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Send WhatsApp update" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/wa\.me\/91\d+\?text=/);
    expect(decodeURIComponent(popup.url())).toContain("dispatched via ABT Parcel, LR 88213: 10L Tilting Wet Grinder ×1");
    await popup.close();
    await expect(card).toContainText("2 left to ship");

    // Ship the rest.
    await card.getByRole("button", { name: "Dispatch" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Dispatch 2 machines" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Deliver both lots.
    for (const n of [1, 2]) {
      await card.getByRole("button", { name: "Delivered" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Confirm delivered" }).click();
      await expect(page.getByText(`${number}: delivery confirmed.`).first()).toBeVisible();
      if (n === 1) await expect(card).toBeVisible();
    }
    await expect(card).toHaveCount(0); // left the board

    const done = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    expect(done.status).toBe("CLOSED");
    expect(done.lines.map((l) => l.dispatchedQty).sort()).toEqual([1, 2]);

    await page.goto(`/orders/${orderId}`);
    await expect(page.getByTestId("dispatch-row")).toHaveCount(2);
    await expect(page.getByRole("link", { name: "Photo 1" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/order-detail-dispatches.png`, fullPage: true });
    await ctx.close();

    // Mobile board: one column at a time with segmented tabs.
    const m = await browser.newContext({ ...devices["Pixel 7"], baseURL });
    const mp = await m.newPage();
    await mp.goto("/login");
    await mp.getByLabel("Mobile number").fill(phone);
    await mp.getByLabel("Password").fill(PASSWORD);
    await mp.getByRole("button", { name: /sign in/i }).click();
    await mp.waitForURL(/\/(home|dashboard|payments)$/);
    await mp.goto("/dispatch");
    await expect(mp.getByRole("tab").first()).toBeVisible();
    await mp.screenshot({ path: `${SHOTS}/dispatch-board-mobile.png`, fullPage: true });
    await m.close();
  });
});
