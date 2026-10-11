// §11.13 Settings → WhatsApp: save credentials (secrets write-only), webhook URL
// + verify token shown, test send falls back to a wa.me link when not connected.
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });
const PASSWORD = process.env.SEED_PASSWORD_ADMIN ?? "";

test("admin configures WhatsApp and test-sends (deep-link fallback)", async ({ page }, ti) => {
  test.skip(ti.project.name === "mobile" || !PASSWORD, "Desktop; set SEED_PASSWORD_ADMIN");
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("9840000002");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(home|dashboard|payments)$/);

  await page.goto("/settings/whatsapp");
  await expect(page.getByRole("heading", { name: "WhatsApp" })).toBeVisible();
  await expect(page.locator("[data-gold]")).toHaveCount(1);
  await page.getByLabel("Pay-to line in reminders").fill("UPI: kumaar@hdfcbank");
  await page.getByLabel("App secret (webhook signature)").fill("e2e-app-secret");
  await page.getByRole("button", { name: "Save WhatsApp settings" }).click();
  await expect(page.getByText("WhatsApp settings saved.")).toBeVisible();
  await page.reload();
  // Secret is never echoed back — only "saved (encrypted)".
  await expect(page.getByLabel("App secret (webhook signature)")).toHaveValue("");
  await expect(page.getByLabel("App secret (webhook signature)")).toHaveAttribute("placeholder", /saved \(encrypted\)/);
  await expect(page.getByLabel("Pay-to line in reminders")).toHaveValue("UPI: kumaar@hdfcbank");
  await expect(page.locator('input[readonly][value$="/api/whatsapp/webhook"]')).toBeVisible();

  await page.getByLabel("Phone for the test").fill("9843722055");
  await page.getByRole("button", { name: "Send test reminder" }).click();
  await expect(page.getByRole("link", { name: "Open in WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/919843722055\?text=Gentle%20reminder/);
  await page.screenshot({ path: `${SHOTS}/settings-whatsapp.png`, fullPage: true });
});
