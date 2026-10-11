// Single-page screenshot: log in and grab one URL. Pass PATH env.
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "screenshots");
await mkdir(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const EMAIL = process.env.LOGIN_EMAIL ?? "team.digitalvetri@gmail.com";
const PASSWORD = "Sales@2026";
const TARGET = process.env.PATH_TO_SHOT ?? "/dashboard";
const NAME = process.env.SHOT_NAME ?? "single";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`);
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL(/\/(dashboard|home)/, { timeout: 20_000 });
console.log(`signed in → ${page.url()}`);

await page.goto(`${BASE}${TARGET}`);
await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(1200);
const out = path.join(OUT, `${NAME}.png`);
await page.screenshot({ path: out, fullPage: true });
console.log(out);
await browser.close();
