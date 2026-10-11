// Log in as owner, visit key pages, screenshot each. Writes PNGs to
// screenshots/*.png so we can show the user what the app looks like.
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "screenshots");
await mkdir(OUT, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.LOGIN_EMAIL ?? "team.digitalvetri@gmail.com";
const PASSWORD = process.env.LOGIN_PASSWORD ?? "Sales@2026";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

async function shot(name) {
  const out = path.join(OUT, `${name}.png`);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  // Give React a beat after streaming data finishes.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`  ${out}`);
}

console.log(`→ ${BASE}/login`);
await page.goto(`${BASE}/login`);
await shot("01-login");

await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/(dashboard|home)/, { timeout: 20_000 });
console.log(`✓ signed in → ${page.url()}`);

await shot("02-dashboard");

const EMP_ID = process.env.EMP_ID ?? "";
const stops = [
  { path: "/employees", name: "03-employees" },
  { path: "/orders", name: "04-orders" },
  { path: "/catalogue", name: "05-catalogue" },
  { path: "/settings", name: "10-settings" },
  ...(EMP_ID ? [{ path: `/employees/${EMP_ID}`, name: "11-employee-detail" }] : []),
];
for (const s of stops) {
  console.log(`→ ${s.path}`);
  await page.goto(`${BASE}${s.path}`);
  await shot(s.name);
}

await browser.close();
console.log(`\nDone. ${stops.length + 2} screenshots in ${OUT}`);
