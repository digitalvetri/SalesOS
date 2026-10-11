// §17-P2 gate: "Sales creates an order for an existing customer < 60s".
// We seed one product and one customer via Prisma, then drive the 3-step wizard
// in a Sales session (Viji). Playwright trace duration is asserted.
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = process.env.SEED_PASSWORD_SALES ?? "";
// Local Supabase stack signal. The actual DATABASE_URL env is loaded by
// Playwright's parent shell (same as how we run the suite locally).
const DB_READY =
  Boolean(process.env.DATABASE_URL) && /:55422\b/.test(process.env.DATABASE_URL ?? "");

test.describe("New-order wizard — Sales creates an order under 60s (P2 gate)", () => {
  test.skip(!PASSWORD || !DB_READY, "Set SEED_PASSWORD_SALES + local Supabase stack to run");

  const prisma = new PrismaClient();
  // These IDs live on the seeded dev tenant (ki-kfm-pilot). We create one dedicated
  // product (via a one-off category) and one customer the test can rely on.
  let productId = "";
  let customerPhone = "";
  const PRODUCT_NAME = `E2E-Order Grinder ${Date.now()}`;

  test.beforeAll(async () => {
    const tenant = await prisma.tenant.findUnique({ where: { slug: "ki-kfm-pilot" } });
    if (!tenant) throw new Error("seeded tenant missing");

    const category = await prisma.productCategory.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: "E2E Orders" } },
      create: { tenantId: tenant.id, name: "E2E Orders" },
      update: {},
    });

    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: PRODUCT_NAME,
        spec: "1 HP",
        searchText: PRODUCT_NAME.toLowerCase(),
        aliases: [],
        customerPrice: "32000",
        dealerPrice: "28000",
        gstRate: "18",
      },
    });
    productId = product.id;

    customerPhone = `9${Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("")}`;
    await prisma.customer.create({
      data: {
        tenantId: tenant.id,
        phoneE164: `+91${customerPhone}`,
        name: "E2E Existing Customer",
      },
    });
  });

  test.afterAll(async () => {
    // Clean up only the artefacts we created.
    const tenant = await prisma.tenant.findUnique({ where: { slug: "ki-kfm-pilot" } });
    if (tenant) {
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
      await prisma.customer
        .deleteMany({ where: { tenantId: tenant.id, phoneE164: `+91${customerPhone}` } })
        .catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  test("Viji picks an existing customer, adds a machine, confirms", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Spec §11.3 is mobile-first; validate there");

    // Login as Sales (Viji — phone 9840000013, seeded).
    await page.goto("/login");
    await page.getByLabel("Mobile number").fill("9840000013");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard|payments)$/);

    const t0 = Date.now();

    await page.goto("/orders/new");
    await expect(page.getByRole("heading", { name: /who is this order for/i })).toBeVisible();

    // Step 1 — type the customer's phone, wait for the match, open existing.
    await page.getByPlaceholder(/98437 22055/).fill(customerPhone);
    const openExistingButton = page.getByRole("button", { name: /open existing for/i });
    await expect(openExistingButton).toBeVisible({ timeout: 5_000 });
    await openExistingButton.click();

    // Step 2 — ProductPicker.
    await expect(page.getByRole("heading", { name: /what are they buying/i })).toBeVisible();
    await page.getByRole("button", { name: /\+ add machine/i }).click();
    await page.getByPlaceholder(/search machine/i).fill(PRODUCT_NAME.slice(0, 10));
    await page.getByText(PRODUCT_NAME).click();

    // Move to step 3.
    await page.getByRole("button", { name: /^next →$/i }).click();

    // Step 3 — confirm (no advance for this baseline).
    await expect(page.getByRole("heading", { name: /payment & confirm/i })).toBeVisible();
    await page.getByRole("button", { name: /confirm order/i }).click();

    // Lands on the order detail page.
    await page.waitForURL(/\/orders\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByText("E2E Existing Customer")).toBeVisible();
    // §11.3 success screen: big number + "Share on WhatsApp" (wa.me fallback when
    // the Cloud API isn't connected — the confirmation checkbox defaults ON).
    const created = page.getByTestId("order-created");
    await expect(created).toBeVisible();
    await expect(created.getByRole("link", { name: /share on whatsapp|whatsapp இல் பகிர்/i })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+\?text=/);

    const elapsedSeconds = (Date.now() - t0) / 1000;
    console.log(`[gate] wizard completed in ${elapsedSeconds.toFixed(1)}s`);
    expect(elapsedSeconds).toBeLessThan(60);

    await page.screenshot({ path: `${SHOTS}/order-detail-after-wizard.png`, fullPage: true });
  });
});
