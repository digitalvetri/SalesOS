// Chunk C smoke: admin imports a tiny synthetic xlsx price list through the full
// preview → commit flow, then confirms the resulting products show up on the
// price-list page.
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = process.env.SEED_PASSWORD_ADMIN ?? "";

async function makeSampleXlsx(targetPath: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Prices");
  ws.addRow(["SalesOS e2e price list"]);
  ws.addRow([]);
  ws.addRow(["PRODUCT", "HP", "DEALER PRICE w/o MOTOR", "DEALER PRICE", "CUSTOMER PRICE"]);
  ws.addRow(["WET GRINDERS"]);
  ws.addRow(["E2E 10L Tilting", "1 HP", 24000, 28000, 32000]);
  ws.addRow(["", "1.5 HP", 26000, 30500, 34500]);
  ws.addRow([]);
  ws.addRow(["TURBO STOVES"]);
  ws.addRow(["E2E 3kg Turbo", "", 14000, 16500, 18500]);
  await wb.xlsx.writeFile(targetPath);
}

test.describe("Catalogue — price list import", () => {
  test.skip(!PASSWORD, "Set SEED_PASSWORD_ADMIN to run catalogue tests");

  test("admin uploads an xlsx, previews, commits, sees products on the price list", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Price list editor is desktop-first in P1");

    // Build a tiny xlsx we can feed to <input type=file>.
    const fixturePath = path.resolve("docs/evidence/e2e-tmp-pricelist.xlsx");
    await makeSampleXlsx(fixturePath);

    // Login.
    await page.goto("/login");
    await page.getByLabel("Mobile number").fill("9840000002");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(home|dashboard|payments)$/);

    // Go to Catalogue → Import.
    await page.goto("/catalogue");
    await page.getByRole("link", { name: /import xlsx/i }).first().click();
    await page.waitForURL(/\/catalogue\/import$/);
    await expect(page.getByRole("heading", { name: /import price list/i })).toBeVisible();

    // Upload the fixture.
    await page.setInputFiles("#file", fixturePath);

    // Preview totals should populate. (Preview table lists two "E2E 10L Tilting"
    // rows — the parent + the inherited-name continuation — hence .first().)
    await expect(page.getByText(/rows found/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("E2E 10L Tilting").first()).toBeVisible();

    // Commit.
    await page.getByRole("button", { name: /commit \d+ rows/i }).click();

    // Back on the price list, our items are present.
    await page.waitForURL(/\/catalogue$/, { timeout: 15_000 });
    await expect(page.getByText("E2E 10L Tilting").first()).toBeVisible();
    await expect(page.getByText("E2E 3kg Turbo")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/catalogue-after-import.png`, fullPage: true });
  });
});
