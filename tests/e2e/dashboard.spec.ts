// §17-P5: Admin dashboard (§11.7) — light + dark screenshots, one gold (the
// Collected hero), click-through on tiles and chart, Accounts sees money only.
// Run against seeded demo data (`pnpm prisma:seed:demo`) for realistic numbers.
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const OWNER = process.env.SEED_PASSWORD_OWNER ?? "";
const ACCOUNTS = process.env.SEED_PASSWORD_ACCOUNTS ?? "";

async function login(page: import("@playwright/test").Page, phone: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(home|dashboard|payments)$/);
}

test.describe("Admin dashboard", () => {
  test("owner: tiles, one gold, light + dark, click-through", async ({ page }, ti) => {
    test.skip(ti.project.name === "mobile" || !OWNER, "Desktop-first (§11.7); set SEED_PASSWORD_OWNER");
    await login(page, "9840000001", OWNER);
    await expect(page).toHaveURL(/\/dashboard$/);
    for (const label of ["Booked", "Collected ✓", "Awaiting verification", "Cash with staff", "Outstanding"]) {
      await expect(page.getByRole("region", { name: "Money" }).getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Sales team" })).toBeVisible();
    await expect(page.locator("[data-gold]")).toHaveCount(1);
    await page.waitForTimeout(600); // let the 400ms count-up settle
    await page.screenshot({ path: `${SHOTS}/dashboard-light.png`, fullPage: true });

    // Dark theme: explicit opt-in from the profile menu.
    await page.getByRole("button", { name: "Kumar" }).click();
    await page.getByRole("menuitem", { name: "Light / dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); // persisted via cookie
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/dashboard-dark.png`, fullPage: true });
    await page.getByRole("button", { name: "Kumar" }).click();
    await page.getByRole("menuitem", { name: "Light / dark theme" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");

    // No dead-end numbers: hero → collected list; a trend column → that month's orders.
    await page.getByRole("link", { name: /Collected ✓/ }).click();
    await expect(page).toHaveURL(/\/payments\/collected\?from=\d{4}-\d{2}-01&to=/);
    await expect(page.getByRole("heading", { name: "Collected (verified)" })).toBeVisible();
    await page.goBack();
    const lastColumn = page.getByRole("img", { name: "Booked · last 12 months" }).getByRole("link").last();
    await lastColumn.click();
    await expect(page).toHaveURL(/\/orders\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}/);
    await expect(page.getByText(/Filtered view/)).toBeVisible();
  });

  test("accounts: money tiles only", async ({ page }, ti) => {
    test.skip(ti.project.name === "mobile" || !ACCOUNTS, "Desktop-first (§11.7); set SEED_PASSWORD_ACCOUNTS");
    await login(page, "9840000003", ACCOUNTS);
    await page.goto("/dashboard");
    await expect(page.getByText("Collected ✓", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sales team" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Needs action" })).toHaveCount(0);
  });
});
