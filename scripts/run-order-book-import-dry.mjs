// Dry-run: parse the fixture at fixtures/synthetic-order-book.xlsx (or the real
// pilot ORDER_DETAILS.xlsx if present) and print the reconciliation table +
// per-sheet summary + duplicate list. No DB writes. Output is pasted verbatim
// into docs/evidence/phase-7.md.
import ExcelJS from "exceljs";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseOrderBook } from "../src/server/domain/import/orderBook.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pilot = path.resolve(__dirname, "..", "fixtures", "ORDER_DETAILS.xlsx");
const synthetic = path.resolve(__dirname, "..", "fixtures", "synthetic-order-book.xlsx");
const target = existsSync(pilot) ? pilot : synthetic;
const label = target === pilot ? "PILOT (ORDER_DETAILS.xlsx)" : "SYNTHETIC (synthetic-order-book.xlsx)";

console.log(`# Order-book dry run — ${label}\n`);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(target);

const sheets = wb.worksheets.map((ws) => {
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
      else if (typeof v === "object" && "formula" in v) {
        out.push({ formula: v.formula, result: v.result ?? null });
      } else if (typeof v === "object" && "text" in v) out.push(v.text);
      else if (typeof v === "object" && "richText" in v) out.push(v.richText.map((p) => p.text).join(""));
      else out.push(null);
    }
    rows.push(out);
  }
  return { name: ws.name, rows };
});

// For the import, product-tracker sheets are skipped at the wizard. Mirror that:
const nonTracker = sheets.filter((s) => !/TURBO ORDER/i.test(s.name) && !/PRICE LIST/i.test(s.name));
const result = parseOrderBook(nonTracker);

const inr = (v) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));

console.log("## Per-sheet summary\n");
const perSheet = new Map();
for (const o of result.orders) {
  const s = perSheet.get(o.sheet) ?? { orders: 0, value: 0, issues: 0, duplicates: 0 };
  s.orders++;
  s.value += Number(o.amount);
  if (o.flags.length > 0) s.issues++;
  if (o.flags.includes("POSSIBLE_DUPLICATE")) s.duplicates++;
  perSheet.set(o.sheet, s);
}
console.log("| Sheet | Orders | Value | With issues | Duplicates |");
console.log("|---|---:|---:|---:|---:|");
for (const [sheet, s] of perSheet) {
  console.log(`| ${sheet} | ${s.orders} | ${inr(s.value)} | ${s.issues} | ${s.duplicates} |`);
}
const totalOrders = result.orders.length;
const totalValue = result.orders.reduce((a, o) => a + Number(o.amount), 0);
console.log(`| **TOTAL** | **${totalOrders}** | **${inr(totalValue)}** | — | — |\n`);

console.log("## Reconciliation (computed vs stated monthly totals)\n");
console.log("| Sheet | Month | Computed | Stated | Diff % |");
console.log("|---|---|---:|---:|---:|");
for (const r of result.reconciliation) {
  const diff = r.diffPct === null ? "—" : `${r.diffPct > 0 ? "+" : ""}${r.diffPct}%`;
  console.log(`| ${r.sheet} | ${r.month} | ${inr(r.computed)} | ${r.stated ? inr(r.stated) : "—"} | ${diff} |`);
}
console.log();

const flagCounts = {};
for (const o of result.orders) for (const f of o.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
console.log("## Flag counts\n");
console.log("| Flag | Count |");
console.log("|---|---:|");
for (const [flag, count] of Object.entries(flagCounts)) console.log(`| ${flag} | ${count} |`);
console.log();

const dupes = result.orders.filter((o) => o.flags.includes("POSSIBLE_DUPLICATE"));
console.log(`## Duplicates (${dupes.length})\n`);
if (dupes.length === 0) {
  console.log("None.\n");
} else {
  console.log("| Ref | Customer | Amount | Month | Duplicate of |");
  console.log("|---|---|---:|---|---|");
  for (const d of dupes) {
    console.log(`| ${d.ref} | ${d.customerName} | ${inr(d.amount)} | ${d.month} | ${d.duplicateOf ?? "—"} |`);
  }
  console.log();
}

const sample = result.orders.slice(0, 5);
console.log("## Sample first 5 orders\n");
console.log("| Ref | Date | Customer | Phone | Amount | Status | Flags |");
console.log("|---|---|---|---|---:|---|---|");
for (const o of sample) {
  console.log(
    `| ${o.ref} | ${o.date} | ${o.customerName} | ${o.phone ?? "—"} | ${inr(o.amount)} | ${o.status} | ${o.flags.join(", ") || "—"} |`,
  );
}
