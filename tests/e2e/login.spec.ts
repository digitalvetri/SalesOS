import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

test.describe("Login screen", () => {
  test("renders in English", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "SalesOS" })).toBeVisible();
    await expect(page.getByLabel("Mobile number")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/login-en.png`, fullPage: true });
  });

  test("renders in Tamil after toggle", async ({ page, context }) => {
    await context.addCookies([
      { name: "salesos.lang", value: "ta", path: "/", url: "http://localhost:3000" },
    ]);
    await page.goto("/login");
    await expect(page.getByLabel("கைபேசி எண்")).toBeVisible();
    await expect(page.getByRole("button", { name: /உள்நுழை/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/login-ta.png`, fullPage: true });
  });

  test("shows invalid-credentials message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Mobile number").fill("9000000000");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page.getByText(/mobile number or password is wrong/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
