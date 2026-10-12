// Re-categorize pilot products using the Excel's OWN section layout.
// A "section" = a run of product rows separated by one or more blank rows.
// Category label per section = the first non-size words of the first product
// in the block, with trailing variant markers (BELT TYPE, GEAR BOX, …) stripped.
//
// Dry run by default. Pass --commit to apply.
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "..", "fixtures", "price-list.xlsx");
const COMMIT = process.argv.includes("--commit");

// ─── Load Excel ──────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const ws = wb.worksheets[0];

const text = (c) => {
  const v = c?.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "formula" in v) return String(v.result ?? v.formula);
  if (typeof v === "object" && "text" in v) return v.text;
  if (typeof v === "object" && "richText" in v) return v.richText.map((p) => p.text).join("");
  return String(v);
};

// Column layout: A=serial(ignore), B=PRODUCT, C=HP, D=DEALER w/o MOTOR,
// E=DEALER, F=CUSTOMER.
const COL_NAME = 2;
const COL_SPEC = 3;
const COL_PRICE_COLS = [4, 5, 6];

const maxRow = Math.max(ws.rowCount, ws.actualRowCount ?? 0);

// ─── Split into blocks separated by blank rows ───────────────────────
const blocks = [];
let current = [];
let lastProductName = "";
for (let r = 2; r <= maxRow; r++) {
  const row = ws.getRow(r);
  const name = text(row.getCell(COL_NAME)).trim();
  const spec = text(row.getCell(COL_SPEC)).trim();
  const hasAnyPrice = COL_PRICE_COLS.some((c) => {
    const t = text(row.getCell(c)).replace(/[₹,\s]/g, "");
    return t && !/^nil+$/i.test(t) && !isNaN(Number(t));
  });

  const isBlank = !name && !spec && !hasAnyPrice;
  if (isBlank) {
    if (current.length > 0) {
      blocks.push(current);
      current = [];
    }
    lastProductName = "";
    continue;
  }

  let effectiveName = name;
  if (!effectiveName && lastProductName) effectiveName = lastProductName;
  else if (effectiveName) lastProductName = effectiveName;
  if (!effectiveName) continue;

  current.push({ rowIndex: r, name: effectiveName, spec: spec || null });
}
if (current.length > 0) blocks.push(current);

// ─── Derive label per block ──────────────────────────────────────────
// Strategy: find the longest word-sequence that appears in EVERY product
// name within the block (case-insensitive, numbers & unit tokens masked
// out so "2 LTR WET GRINDER" and "10 LTR WET GRINDER" match on "WET GRINDER").
const UNIT_RX = /^(ltr|ltrs|lt|liter|liters|litre|litres|kg|kgs|hp|w|watts?|inch|cm|mm|in|hr|hour|hours|tier|layer|bird|birds|cup|cups|ply|phase|ph|v)$/i;
const SIZE_NUM_RX = /^\d+(\.\d+)?["']*$/;
const STOP = new Set([
  "THE","A","AN","OF","AND","&","FOR","WITH","TO","IN","ON","AT","W/O","W",
  "MC","M/C","MACHINE","MACHINES",
]);
// Noise words that shouldn't appear in a category label even if common.
const NOISE = new Set([
  "FULL","REGULAR","HEAVY","MODEL","TYPE","SMALL","LARGE","BIG","MINI",
  "SS","MS","HYDRAULIC","PNEUMATIC","AUTOMATIC","MANUAL","COMMERCIAL",
]);

function wordsOf(name) {
  return String(name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9/"\s'.-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Return a word list with size+unit tokens masked as "" so they don't block
// n-gram matching across different-sized products.
function tokensFor(name) {
  const raw = wordsOf(name);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    // Compound e.g. "2LTR", "25KG", "1HP", "3BIRD", "3LAYER", "2IN1"
    if (/^\d+(\.\d+)?[A-Z]+\d*$/.test(w)) continue;
    if (SIZE_NUM_RX.test(w)) {
      // digit on its own; also eat following unit if present
      if (i + 1 < raw.length && UNIT_RX.test(raw[i + 1])) i++;
      continue;
    }
    if (UNIT_RX.test(w)) continue;
    if (STOP.has(w)) continue;
    out.push(w);
  }
  return out;
}

function labelFor(block) {
  const tokLists = block.map((b) => tokensFor(b.name));
  const minLen = Math.min(...tokLists.map((t) => t.length));
  // Longest n-gram common to every product (contiguous), skipping those that
  // are entirely noise words.
  for (let n = Math.min(4, minLen); n >= 1; n--) {
    const counts = new Map();
    for (const toks of tokLists) {
      const seen = new Set();
      for (let i = 0; i + n <= toks.length; i++) {
        const gram = toks.slice(i, i + n).join(" ");
        if (toks.slice(i, i + n).every((w) => NOISE.has(w))) continue;
        if (seen.has(gram)) continue;
        seen.add(gram);
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
    }
    const universal = [...counts.entries()].filter(([, c]) => c === block.length);
    if (universal.length > 0) {
      // Prefer the longest, then the one appearing earliest in the first product's tokens.
      universal.sort((a, b) => b[0].length - a[0].length);
      return titleCase(universal[0][0]);
    }
  }
  // Fallback: most salient word in the first product's tokens.
  const first = tokLists[0] ?? [];
  const salient = first.find((w) => !NOISE.has(w)) ?? first[0] ?? "Other";
  return titleCase(salient);
}

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .split(" ")
    .map((w) => {
      if (w.length === 0) return w;
      // Keep known acronyms uppercase.
      const up = w.toUpperCase();
      if (["IRG", "SS", "MS", "KFM", "KI", "HP"].includes(up)) return up;
      return w[0].toUpperCase() + w.slice(1);
    })
    .join(" ");
}

const blockLabels = blocks.map((b, i) => {
  const label = labelFor(b);
  if (process.argv.includes("--verbose")) {
    console.log(`[block ${i + 1}] "${label}"  ← ${b.length} items, first="${b[0].name}"`);
  }
  return { products: b, label };
});

// Merge blocks that happen to produce the same label.
const mergedPlan = new Map();
for (const { label, products } of blockLabels) {
  if (!mergedPlan.has(label)) mergedPlan.set(label, []);
  mergedPlan.get(label).push(...products);
}

// ─── Match Excel rows to DB products ────────────────────────────────
const p = new PrismaClient();
const dbProducts = await p.product.findMany({
  where: { active: true },
  select: { id: true, name: true, spec: true, categoryId: true },
});
const byKey = new Map();
for (const r of dbProducts) {
  const key = `${r.name.toLowerCase().trim()}|${(r.spec ?? "").toLowerCase().trim()}`;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r);
}

const plan = new Map();
const unmatched = [];
for (const [label, items] of mergedPlan.entries()) {
  for (const item of items) {
    const key = `${item.name.toLowerCase().trim()}|${(item.spec ?? "").toLowerCase().trim()}`;
    const hits = byKey.get(key);
    if (!hits || hits.length === 0) {
      unmatched.push({ ...item, intendedLabel: label });
      continue;
    }
    if (!plan.has(label)) plan.set(label, []);
    plan.get(label).push(hits.shift());
  }
}

const sortedLabels = [...plan.keys()].sort(
  (a, b) => plan.get(b).length - plan.get(a).length,
);

console.log(`\n=== Excel-section plan ===`);
console.log(`Blocks in Excel: ${blocks.length}`);
console.log(`Distinct labels after merge: ${mergedPlan.size}`);
console.log(`DB products matched: ${dbProducts.length - unmatched.length}/${dbProducts.length}`);
console.log(`Unmatched Excel rows: ${unmatched.length}\n`);

for (const label of sortedLabels) {
  console.log(`  ${label.padEnd(44)} ${plan.get(label).length}`);
}

if (unmatched.length > 0) {
  console.log(`\nFirst 15 unmatched Excel rows (name/spec drift):`);
  for (const u of unmatched.slice(0, 15))
    console.log(`  R${u.rowIndex} → "${u.intendedLabel}" :: "${u.name}" [${u.spec ?? "—"}]`);
}

if (!COMMIT) {
  console.log(`\nDry run — pass --commit to apply.`);
  await p.$disconnect();
  process.exit(0);
}

const actor =
  (await p.user.findFirst({
    where: { role: "OWNER", active: true },
    select: { id: true, tenantId: true },
  })) ??
  (await p.user.findFirst({ where: { active: true }, select: { id: true, tenantId: true } }));
if (!actor) throw new Error("No active user to attribute migration to");
const tenantId = actor.tenantId;

const existingCats = await p.productCategory.findMany({ where: { tenantId } });
const catByName = new Map(existingCats.map((c) => [c.name.toLowerCase(), c]));

console.log(`\n=== Committing ===`);
for (const label of sortedLabels) {
  let cat = catByName.get(label.toLowerCase());
  if (!cat) {
    const existingMaxSort = await p.productCategory.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });
    cat = await p.productCategory.create({
      data: { tenantId, name: label, sortOrder: (existingMaxSort._max.sortOrder ?? 0) + 1 },
      select: { id: true, name: true },
    });
    console.log(`  Created category: ${label}`);
  }
  const ids = plan.get(label).filter((pr) => pr.categoryId !== cat.id).map((pr) => pr.id);
  if (ids.length > 0) {
    await p.product.updateMany({ where: { id: { in: ids } }, data: { categoryId: cat.id } });
    console.log(`  ${label} ← ${ids.length} products moved`);
  }
}

console.log(`\nDone.`);
await p.$disconnect();
