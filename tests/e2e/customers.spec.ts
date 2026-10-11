// Chunk D smoke: admin lists customers, creates a new one via phone-first flow,
// then re-opens the create form with the same phone and gets routed to the existing record.
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

const PASSWORD = process.env.SEED_PASSWORD_ADMIN ?? "";

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill("9840000002");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/home$/);
}

test.describe("Customers — phone-first create + list", () => {
  test.skip(!PASSWORD, "Set SEED_PASSWORD_ADMIN to run customers tests");

  test("admin creates a new customer, re-visiting with same phone opens existing", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Customers index is desktop-first in P1");

    const randomSubscriber = `9${Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join("")}`;

    await loginAsAdmin(page);
    await page.goto("/customers");
    await expect(page.getByRole("heading", { name: /^Customers$/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/customers-list.png`, fullPage: true });

    // Open the new-customer page.
    await page.getByRole("link", { name: /\+ new customer/i }).click();
    await page.waitForURL(/\/customers\/new$/);

    await page.getByLabel("Mobile number").fill(randomSubscriber);
    await page.getByLabel("Full name").fill("Playwright Pack");
    await page.getByLabel("Business name (optional)").fill("Playwright Pvt Ltd");
    await page.getByRole("button", { name: /create customer/i }).click();

    // Lands on the customer detail page.
    await page.waitForURL(/\/customers\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: /Playwright/ }),
    ).toBeVisible();

    // Second visit with the same phone — should match and offer "Open existing".
    await page.goto("/customers/new");
    await page.getByLabel("Mobile number").fill(randomSubscriber);
    await expect(page.getByText("Playwright Pack", { exact: false })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByText(/this mobile number already has a customer/i)).toBeVisible();
    await page.getByRole("button", { name: /open existing customer/i }).click();
    await page.waitForURL(/\/customers\/[^/]+$/);
    await expect(
      page.getByRole("heading", { name: /Playwright/ }),
    ).toBeVisible();
  });
});
