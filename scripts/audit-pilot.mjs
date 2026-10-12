// Full audit of the pilot ORDER_DETAILS.xlsx. Zero DB writes.
// Checks every quality concern that came up in the dry run so we can decide
// confidently whether to commit, clean, or defer the historical import.
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrderBook } from "../src/server/domain/import/orderBook.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "..", "fixtures", "ORDER_DETAILS.xlsx");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

const inr = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));
const text = (c) => {
  const v = c?.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "formula" in v) return String(v.result ?? v.formula);
  if (typeof v === "object" && "text" in v) return v.text;
  if (typeof v === "object" && "richText" in v) return v.richText.map((p) => p.text).join("");
  return String(v);
};

// ═══════ 1. All sheets (including hidden) ═══════
console.log("\n═══════ 1. Workbook structure ═══════\n");
for (const ws of wb.worksheets) {
  const state = ws.state ?? "visible";
  console.log(`  ${ws.name.padEnd(20)}  rows=${ws.rowCount.toString().padStart(5)}  cols=${(ws.actualColumnCount ?? 0).toString().padStart(3)}  state=${state}`);
}

// ═══════ 2. Parse via our parser ═══════
const toSheet = (ws) => {
  const rows = [];
  const max = Math.max(ws.rowCount, ws.actualRowCount ?? 0);
  for (let r = 1; r <= max; r++) {
    const row = ws.getRow(r);
    const out = [];
    const cols = Math.max(row.actualCellCount ?? 0, ws.actualColumnCount ?? 0);
    for (let c = 1; c <= cols; c++) {
      const v = row.getCell(c).value;
      if (v === null || v === undefined) out.push(null);
      else if (v instanceof Date) out.push(v);
      else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push(v);
      else if (typeof v === "object" && "formula" in v) out.push({ formula: v.formula, result: v.result ?? null });
      else if (typeof v === "object" && "text" in v) out.push(v.text);
      else if (typeof v === "object" && "richText" in v) out.push(v.richText.map((p) => p.text).join(""));
      else out.push(null);
    }
    rows.push(out);
  }
  return { name: ws.name, rows };
};
const sheets = wb.worksheets
  // Exclude obvious trackers / price-list / summary sheets if any
  .filter((ws) => !/TURBO ORDER|PRICE LIST|SUMMARY|INVENTORY|STOCK/i.test(ws.name))
  .map(toSheet);
const result = parseOrderBook(sheets);

// ═══════ 3. BALANCE_MISMATCH — root cause ═══════
console.log("\n═══════ 2. BALANCE_MISMATCH breakdown ═══════\n");
const mismatches = result.orders.filter((o) => o.flags.includes("BALANCE_MISMATCH"));
console.log(`Total mismatched: ${mismatches.length} / ${result.orders.length} orders\n`);
const bucket = { "amount≈adv+bal": 0, "balance==amount (unpaid, no advance)": 0, "balance==0 (fully paid)": 0, "advance>amount": 0, other: 0 };
for (const o of mismatches) {
  const amt = new Decimal(o.amount);
  const adv = new Decimal(o.advance);
  const bal = new Decimal(o.balance);
  const diff = amt.minus(adv).minus(bal).abs();
  if (diff.lte(1)) bucket["amount≈adv+bal"]++;
  else if (bal.equals(amt) && adv.isZero()) bucket["balance==amount (unpaid, no advance)"]++;
  else if (bal.isZero() && amt.gt(0)) bucket["balance==0 (fully paid)"]++;
  else if (adv.gt(amt)) bucket["advance>amount"]++;
  else bucket.other++;
}
for (const [label, count] of Object.entries(bucket)) console.log(`  ${label.padEnd(42)} ${count}`);

console.log("\n  Sample 5 'other' mismatches:");
let shown = 0;
for (const o of mismatches) {
  const amt = new Decimal(o.amount);
  const adv = new Decimal(o.advance);
  const bal = new Decimal(o.balance);
  const diff = amt.minus(adv).minus(bal).abs();
  if (diff.lte(1)) continue;
  if (bal.equals(amt) && adv.isZero()) continue;
  if (bal.isZero() && amt.gt(0)) continue;
  if (adv.gt(amt)) continue;
  console.log(`    ${o.ref}  amt=${inr(amt)} adv=${inr(adv)} bal=${inr(bal)}  (expected bal=${inr(amt.minus(adv))}; off by ${inr(amt.minus(adv).minus(bal).abs())})`);
  if (++shown >= 5) break;
}

// ═══════ 4. MURUGAN corrupt total ═══════
console.log("\n═══════ 3. Corrupt stated totals (|diff| > 10%) ═══════\n");
for (const r of result.reconciliation) {
  if (r.diffPct !== null && Math.abs(r.diffPct) > 10) {
    console.log(`  ${r.sheet.padEnd(12)} ${r.month}  computed=${inr(r.computed).padStart(15)}  stated=${inr(r.stated).padStart(20)}  diff=${r.diffPct}%`);
  }
}

// ═══════ 5. VIJI's month attribution ═══════
console.log("\n═══════ 4. VIJI — distribution by row.date vs block.month ═══════\n");
const viji = result.orders.filter((o) => o.sheet === "VIJI");
const byRowMonth = new Map();
const byBlockMonth = new Map();
for (const o of viji) {
  const rowMonth = (o.date ?? "").slice(0, 7);
  byRowMonth.set(rowMonth, (byRowMonth.get(rowMonth) ?? 0) + 1);
  byBlockMonth.set(o.month, (byBlockMonth.get(o.month) ?? 0) + 1);
}
console.log("  By ROW.date (what the parser could aggregate on):");
for (const [m, n] of [...byRowMonth.entries()].sort()) console.log(`    ${m}  ${n}`);
console.log("\n  By CURRENT block.month (what the parser DOES aggregate on):");
for (const [m, n] of [...byBlockMonth.entries()].sort()) console.log(`    ${m}  ${n}`);

// ═══════ 6. Duplicates missed by phone-first rule ═══════
console.log("\n═══════ 5. Potential duplicates MISSED by current rule (name+amount+month match, phone differs) ═══════\n");
const byNameAmtMonth = new Map();
for (const o of result.orders) {
  const key = `${o.customerName.trim().toLowerCase()}|${o.amount}|${o.month}`;
  if (!byNameAmtMonth.has(key)) byNameAmtMonth.set(key, []);
  byNameAmtMonth.get(key).push(o);
}
let missed = 0;
for (const [, group] of byNameAmtMonth) {
  if (group.length < 2) continue;
  // Skip rows the parser already marked
  if (group.every((g) => g.flags.includes("POSSIBLE_DUPLICATE"))) continue;
  // Skip Unknown-named rows (noise)
  if (/^unknown/i.test(group[0].customerName)) continue;
  // Skip zero-amount rows
  if (new Decimal(group[0].amount).isZero()) continue;
  // Must span different sheets
  const sheets = new Set(group.map((g) => g.sheet));
  if (sheets.size < 2) continue;
  missed++;
  if (missed <= 10) {
    console.log(`  "${group[0].customerName}" ₹${new Decimal(group[0].amount).toString()} in ${group[0].month}`);
    for (const g of group) console.log(`    ${g.ref}  phone=${g.phone ?? "—"}`);
  }
}
console.log(`\n  Total extra cross-sheet duplicates: ${missed}`);

// ═══════ 7. Phone normalization sanity ═══════
console.log("\n═══════ 6. Phone number issues ═══════\n");
const phoneIssues = { tooShort: 0, tooLong: 0, nonNumeric: 0, startsWithWrongDigit: 0, ok: 0 };
for (const o of result.orders) {
  const p = o.phone;
  if (!p) continue;
  if (!/^\d+$/.test(p)) phoneIssues.nonNumeric++;
  else if (p.length < 10) phoneIssues.tooShort++;
  else if (p.length > 10) phoneIssues.tooLong++;
  else if (!/^[6-9]/.test(p)) phoneIssues.startsWithWrongDigit++;
  else phoneIssues.ok++;
}
for (const [k, v] of Object.entries(phoneIssues)) console.log(`  ${k.padEnd(26)} ${v}`);

// ═══════ 8. Grand totals ═══════
console.log("\n═══════ 7. Grand totals vs spec target ═══════\n");
const total = result.orders.reduce((a, o) => a.plus(o.amount), new Decimal(0));
const paid = result.orders.reduce((a, o) => a.plus(o.advance), new Decimal(0));
const outstanding = result.orders.reduce((a, o) => a.plus(o.balance), new Decimal(0));
console.log(`  Orders:            ${result.orders.length}  (spec target ~1,255)`);
console.log(`  Grand total:       ${inr(total)}  (spec target ~₹7.05 Cr)`);
console.log(`  Advance received:  ${inr(paid)}`);
console.log(`  Outstanding:       ${inr(outstanding)}  (spec mentions ~₹60L on paper, with inflation from stale balances)`);

console.log("\n═══════ 8. Summary of required changes before commit ═══════\n");
console.log("  Parser fixes (one-liners):");
console.log("    A. month aggregation: use o.date.slice(0,7) not blockMonth");
console.log("    B. duplicate key: compound (phone || '') + name + amount + month");
console.log("  Data cleaning (handled by wizard preview, no code change):");
console.log("    - MURUGAN Jan: skip corrupt stated TOTAL (₹7,203 crore nonsense)");
console.log("    - BALANCE_MISMATCH analysis above decides whether to loosen the ±1 tolerance");
