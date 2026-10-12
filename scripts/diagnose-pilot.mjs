// Diagnostic: inspect VIJI structure (why 481 orders all land in January?) +
// find every Nallamuthu row (why isn't the ₹1,70,000 duplicate caught?).
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "..", "fixtures", "ORDER_DETAILS.xlsx");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);

const text = (c) => {
  const v = c?.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "formula" in v) return String(v.result ?? v.formula);
  if (typeof v === "object" && "text" in v) return v.text;
  if (typeof v === "object" && "richText" in v) return v.richText.map((p) => p.text).join("");
  return String(v);
};

console.log("=== 1. Every row containing 'nallamuthu' (any sheet) ===\n");
for (const ws of wb.worksheets) {
  const max = Math.max(ws.rowCount, ws.actualRowCount ?? 0);
  for (let r = 1; r <= max; r++) {
    const row = ws.getRow(r);
    const cols = Math.max(row.actualCellCount ?? 0, ws.actualColumnCount ?? 0, 10);
    const line = [];
    let hit = false;
    for (let c = 1; c <= cols; c++) {
      const t = text(row.getCell(c));
      if (t && t.toLowerCase().includes("nallamuthu")) hit = true;
      line.push(t);
    }
    if (hit) {
      console.log(`[${ws.name}!R${r}] ${line.map((x) => (x ?? "").slice(0, 25)).join(" | ")}`);
    }
  }
}

console.log("\n=== 2. VIJI structure — first 40 rows, raw ===\n");
const viji = wb.worksheets.find((s) => s.name.toUpperCase() === "VIJI");
if (viji) {
  const maxCols = Math.max(viji.actualColumnCount ?? 0, 10);
  for (let r = 1; r <= Math.min(40, viji.rowCount, viji.actualRowCount ?? 40); r++) {
    const row = viji.getRow(r);
    const cells = [];
    for (let c = 1; c <= maxCols; c++) cells.push(text(row.getCell(c)).slice(0, 20));
    console.log(`R${String(r).padStart(3)}: ${cells.join(" | ")}`);
  }
  console.log("…");
  // Also check: is there ANY lone-date month marker after row 20?
  console.log("\n=== 3. VIJI — rows with a lone date value (potential month markers) ===");
  let markers = 0;
  for (let r = 1; r <= viji.rowCount; r++) {
    const row = viji.getRow(r);
    const cells = [];
    for (let c = 1; c <= maxCols; c++) cells.push(viji.getCell(r, c).value);
    const filled = cells.filter((v) => v !== null && v !== undefined && v !== "");
    if (filled.length === 1 && (filled[0] instanceof Date || typeof filled[0] === "number")) {
      markers++;
      if (markers <= 10) console.log(`R${r}: lone cell = ${filled[0]}`);
    }
  }
  console.log(`Total lone-date rows: ${markers}`);
}
