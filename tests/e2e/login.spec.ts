import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

test.describe("Login screen", () => {
  test("renders in English", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/login-en.png`, fullPage: true });
  });

  test("shows invalid-credentials message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@phone.salesos.local");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/email or password is wrong/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
