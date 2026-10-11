// §17-P3 gate E2E: Sales records a payment with a proof screenshot (§11.5),
// sees it on Collect (§11.6) and sends a WhatsApp reminder (deep link);
// Accounts opens the proof and verifies it in the queue (§11.8), then marks a
// cash-with-staff receipt deposited. Screenshots land in docs/evidence/screenshots.
import { test, expect, devices, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const SALES_PASSWORD = process.env.SEED_PASSWORD_SALES ?? "";
const ACCOUNTS_PASSWORD = process.env.SEED_PASSWORD_ACCOUNTS ?? process.env.SEED_PASSWORD_ADMIN ?? "";
const DB_READY =
  Boolean(process.env.DATABASE_URL) && /:55422\b/.test(process.env.DATABASE_URL ?? "");
const PROOF = "docs/evidence/screenshots/login-en.png"; // any real image works as a "UPI screenshot"

async function login(browser: Browser, baseURL: string, phone: string, password: string, mobile: boolean) {
  const context = await browser.newContext({
    ...(mobile ? devices["Pixel 7"] : { viewport: { width: 1440, height: 900 } }),
    baseURL,
  });
  // Never leave the sandbox for wa.me — answer the deep link locally.
  await context.route(/https:\/\/wa\.me\/.*/, (route) => route.fulfill({ status: 200, body: "wa.me stub" }));
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/home$/);
  return { context, page };
}

test.describe("Payments — record → verify → remind", () => {
  test.skip(!SALES_PASSWORD || !ACCOUNTS_PASSWORD || !DB_READY, "Set SEED_PASSWORD_SALES/ACCOUNTS + local Supabase stack");

  const prisma = new PrismaClient();
  let orderId = "";
  let customerId = "";

  test.beforeEach(async () => {
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "ki-kfm-pilot" } });
    const sales = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, phoneE164: "+919840000012" } }); // Mallika
    const entity = await prisma.billingEntity.findFirstOrThrow({ where: { tenantId: tenant.id, code: "KI" } });
    const customer = await prisma.customer.create({
      data: { tenantId: tenant.id, phoneE164: `+919${Date.now().toString().slice(-9)}`, name: "Gokul Caterers" },
    });
    customerId = customer.id;
    const counter = await prisma.documentCounter.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: "ORDER:KI:26-27" } },
      create: { tenantId: tenant.id, key: "ORDER:KI:26-27", value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        number: `KI/26-27/${String(counter.value).padStart(4, "0")}`,
        entityId: entity.id,
        customerId: customer.id,
        salespersonId: sales.id,
        orderDate: new Date(),
        status: "IN_PRODUCTION",
        subtotal: "24000",
        chargesTotal: "0",
        discount: "0",
        total: "24000",
        balanceDue: "24000",
        createdById: sales.id,
        lines: {
          create: [{ description: "15kg Potato Peeler", qty: 1, unitPrice: "24000", gstRate: "18", lineTotal: "24000" }],
        },
        events: { create: [{ actorId: sales.id, type: "STATUS_CHANGE", toStatus: "CONFIRMED" }] },
      },
    });
    orderId = order.id;
  });

  test.afterEach(async () => {
    const payments = await prisma.payment.findMany({ where: { orderId }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: [orderId, ...payments.map((p) => p.id)] } } });
    await prisma.followUp.deleteMany({ where: { orderId } });
    await prisma.payment.deleteMany({ where: { orderId } });
    await prisma.orderEvent.deleteMany({ where: { orderId } });
    await prisma.orderLine.deleteMany({ where: { orderId } });
    await prisma.order.delete({ where: { id: orderId } }).catch(() => undefined);
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => undefined);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("sales records with proof, accounts verifies, cash deposited", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Drives its own mobile + desktop contexts");
    const baseURL = testInfo.project.use.baseURL!;

    // ── Sales (mobile): record ₹10,000 UPI with a screenshot ──
    const sales = await login(browser, baseURL, "9840000012", SALES_PASSWORD, true);
    const sp = sales.page;
    await sp.goto(`/orders/${orderId}`);
    await sp.getByRole("button", { name: /record payment/i }).click();
    const sheet = sp.getByRole("dialog");
    await expect(sheet.getByText("Balance due")).toBeVisible();
    await expect(sheet.getByLabel("Amount")).toHaveValue("24000");
    await sheet.getByLabel("Amount").fill("10,000");
    await sheet.getByRole("radio", { name: "UPI" }).click();
    await sheet.getByLabel("Received into").selectOption({ label: "KI UPI Scanner" });
    await sheet.getByLabel("UTR / Ref").fill("UTR4102938475");
    await sheet.locator('input[type="file"]').setInputFiles(PROOF);
    await expect(sheet.getByAltText("Payment screenshot preview")).toBeVisible();
    await sp.screenshot({ path: `${SHOTS}/record-payment-sheet.png` });
    await sheet.getByRole("button", { name: "Save payment" }).click();
    await expect(sp.getByText(/Payment saved — RCPT\//)).toBeVisible({ timeout: 10_000 });
    await expect(sp.getByTestId("payment-row")).toHaveCount(1);
    await expect(sp.getByTestId("payment-row").getByText("Awaiting verification")).toBeVisible();
    await expect(sp.getByRole("link", { name: "View proof" })).toBeVisible();

    // Second payment: ₹4,000 cash kept by the salesperson (cash with staff).
    await sp.getByRole("button", { name: /record payment/i }).click();
    await sheet.getByLabel("Amount").fill("4000");
    await sheet.getByRole("radio", { name: "Cash" }).click();
    await expect(sheet.getByText(/Shows as cash with staff/)).toBeVisible();
    await sheet.getByRole("button", { name: "Save payment" }).click();
    await expect(sp.getByTestId("payment-row")).toHaveCount(2, { timeout: 10_000 });
    await expect(sp.getByText("With Mallika")).toBeVisible();

    const db = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(db.balanceDue.toString()).toBe("10000");

    // ── Sales: Collect shows the balance; WhatsApp reminder opens wa.me ──
    await sp.goto("/collect");
    const group = sp.getByTestId("collect-group").filter({ hasText: "Gokul Caterers" });
    await expect(group).toBeVisible();
    await sp.screenshot({ path: `${SHOTS}/collect.png`, fullPage: true });
    const popupPromise = sp.waitForEvent("popup");
    await group.getByRole("button", { name: "WhatsApp" }).click();
    const popup = await popupPromise;
    await popup.waitForURL(/wa\.me\/91\d+\?text=/);
    expect(decodeURIComponent(popup.url())).toContain("₹10,000 is pending for KI/26-27/");
    await expect(sp.getByText("Reminder logged.")).toBeVisible();
    await expect(group.getByRole("button", { name: "Reminded" })).toBeDisabled();

    // ── Accounts (desktop): proof panel, verify, deposit ──
    const acc = await login(browser, baseURL, "9840000003", ACCOUNTS_PASSWORD, false);
    const ap = acc.page;
    await ap.goto("/payments");
    const rows = ap.getByTestId("verify-row").filter({ hasText: db.number });
    await expect(rows).toHaveCount(2);
    await ap.getByRole("button", { name: /open proof for/i }).first().click();
    const proof = ap.getByRole("dialog").getByRole("img", { name: /proof for/i });
    await expect(proof).toBeVisible();
    await expect.poll(() => proof.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    await expect(ap.getByRole("dialog").getByText("UTR4102938475")).toBeVisible();
    await ap.keyboard.press("Escape");

    for (const row of await rows.all()) await row.getByRole("checkbox").check();
    await ap.screenshot({ path: `${SHOTS}/verify-queue.png`, fullPage: true });
    await ap.getByRole("button", { name: /verify selected \(2\)/i }).click();
    await expect(ap.getByText("2 payments verified.")).toBeVisible({ timeout: 10_000 });
    await expect(rows).toHaveCount(0);

    await ap.goto("/payments/cash");
    const cashGroup = ap.getByTestId("cash-group").filter({ hasText: "Mallika" });
    await expect(cashGroup).toBeVisible();
    await ap.screenshot({ path: `${SHOTS}/cash-with-staff.png`, fullPage: true });
    const cashRow = cashGroup.locator("li").filter({ hasText: db.number });
    await cashRow.getByRole("button", { name: "Mark deposited" }).click();
    await ap.getByRole("dialog").getByRole("button", { name: "Mark deposited" }).click();
    await expect(ap.getByText(/marked deposited/)).toBeVisible({ timeout: 10_000 });

    const verified = await prisma.payment.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    expect(verified.map((p) => p.status)).toEqual(["VERIFIED", "VERIFIED"]);
    expect(verified[1]!.depositedToAccountId).not.toBeNull();

    // Order detail reflects it all.
    await ap.goto(`/orders/${orderId}`);
    await expect(ap.getByText("With Mallika")).toHaveCount(0);
    await expect(ap.getByText("Reminder sent (WhatsApp)")).toBeVisible();
    await ap.screenshot({ path: `${SHOTS}/order-detail-payments.png`, fullPage: true });

    await sales.context.close();
    await acc.context.close();
  });
});
