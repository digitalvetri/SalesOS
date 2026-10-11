// Shell screenshots for each role. Requires seeded Supabase users to run end-to-end;
// in CI we exercise them by setting SALESOS_TEST_SESSION cookies in a before-each
// (see docs/evidence/phase-0.md once Supabase credentials are provided).
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "docs/evidence/screenshots";
mkdirSync(SHOTS, { recursive: true });

type Role = "sales" | "dispatch" | "owner" | "admin" | "accounts";

const CREDS: Record<Role, { phone: string; password: string }> = {
  sales: { phone: "9840000013", password: process.env.SEED_PASSWORD_SALES ?? "" },
  dispatch: { phone: "9840000021", password: process.env.SEED_PASSWORD_DISPATCH ?? "" },
  owner: { phone: "9840000001", password: process.env.SEED_PASSWORD_OWNER ?? "" },
  admin: { phone: "9840000002", password: process.env.SEED_PASSWORD_ADMIN ?? "" },
  accounts: { phone: "9840000003", password: process.env.SEED_PASSWORD_ACCOUNTS ?? "" },
};

async function login(page: import("@playwright/test").Page, role: Role) {
  const { phone, password } = CREDS[role];
  test.skip(!password, `Set SEED_PASSWORD_${role.toUpperCase()} to run ${role} shell test`);
  await page.goto("/login");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/home$/);
}

test.describe("Role shells", () => {
  // Non-SALES roles still render the stub empty-state (P5 adds their dashboards).
  // SALES role now sees the full §11.2 home (P2-E).
  const empty = ["owner", "admin", "accounts"] as const;
  for (const role of empty) {
    test(`${role} shell renders empty state`, async ({ page }) => {
      await login(page, role);
      await expect(page.getByText(/You're signed in as/i)).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/shell-${role}.png`, fullPage: true });
    });
  }

  test("dispatch shell renders the queue (§11.0)", async ({ page }) => {
    await login(page, "dispatch");
    await expect(page.getByRole("heading", { name: "Queue" })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/shell-dispatch.png`, fullPage: true });
  });

  test("sales shell renders the §11.2 home", async ({ page }) => {
    await login(page, "sales");
    await expect(page.getByText(/Good (morning|afternoon|evening)/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /\+ new order/i })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/shell-sales.png`, fullPage: true });
  });
});
