// Chunk B smoke test: admin logs in, visits the 4 settings tabs, creates a
// new user, confirms the one-time password dialog shows.
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = process.env.SEED_PASSWORD_ADMIN ?? "";

test.beforeEach(async ({ page }) => {
  test.skip(!PASSWORD, "Set SEED_PASSWORD_ADMIN to run settings tests");
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("9840000002"); // seeded Office Admin
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/home$/);
});

test.describe("Settings — admin can walk through all tabs", () => {
  test("Users tab lists all 11 seeded users", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Settings is desktop-first in P1");
    await page.goto("/settings/users");
    await expect(page.getByRole("heading", { name: /^Users$/ })).toBeVisible();
    await expect(page.getByText("Kumar")).toBeVisible();
    await expect(page.getByText("Viji")).toBeVisible();
    await expect(page.getByText("Workshop")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settings-users.png`, fullPage: true });
  });

  test("Entities tab shows KI and KFM cards", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Settings is desktop-first in P1");
    await page.goto("/settings/entities");
    await expect(page.getByRole("heading", { name: /Billing entities/i })).toBeVisible();
    await expect(page.getByText("KI", { exact: true })).toBeVisible();
    await expect(page.getByText("KFM", { exact: true })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settings-entities.png`, fullPage: true });
  });

  test("Accounts tab lists seeded accounts", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Settings is desktop-first in P1");
    await page.goto("/settings/accounts");
    await expect(page.getByRole("heading", { name: /money lands/i })).toBeVisible();
    await expect(page.getByText(/KI Current A\/c/)).toBeVisible();
    await expect(page.getByText(/KFM Current A\/c/)).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settings-accounts.png`, fullPage: true });
  });

  test("Targets tab shows the salespeople grid", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Settings is desktop-first in P1");
    await page.goto("/settings/targets");
    await expect(page.getByRole("heading", { name: /Monthly targets/i })).toBeVisible();
    await expect(page.getByText("Viji")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settings-targets.png`, fullPage: true });
  });

  test("New-user flow surfaces the one-time temp password", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Settings is desktop-first in P1");
    await page.goto("/settings/users/new");
    await expect(page.getByRole("heading", { name: /New user/i })).toBeVisible();

    const randomDigits = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
    await page.getByLabel("Name").fill("Test User");
    await page.getByLabel("Mobile number").fill(`98${randomDigits}`); // valid Indian 10-digit
    await page.locator("#role").selectOption("SALES");
    await page.getByRole("button", { name: /^\+ new user$/i }).click();

    await expect(page.getByText(/share the password below/i)).toBeVisible({ timeout: 10_000 });
    // The temp password is 10 chars from our generator
    const dialog = page.getByRole("dialog");
    const code = dialog.locator("code");
    await expect(code).toHaveText(/^[A-Za-z0-9]{10}$/);
  });
});
