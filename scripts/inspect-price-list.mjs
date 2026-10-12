// Inspect the price-list sheet structure for category grouping clues.
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(__dirname, "..", "fixtures", "price-list.xlsx");

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

const maxCols = Math.max(ws.actualColumnCount ?? 0, 10);
const maxRow = Math.max(ws.rowCount, ws.actualRowCount ?? 0);

console.log(`Sheet "${ws.name}" rows=${maxRow} cols=${maxCols}\n`);

// Scan every row — detect fill colour / bold / merged-row features that hint at a category header
console.log("=== Scanning rows with bold / fill / merged — likely category headers ===");
let hits = 0;
for (let r = 1; r <= Math.min(maxRow, 300); r++) {
  const row = ws.getRow(r);
  const cells = [];
  for (let c = 1; c <= maxCols; c++) cells.push(text(row.getCell(c)));
  const nonEmpty = cells.filter((x) => x.trim() !== "");

  // Collect formatting of first non-empty cell
  let fmt = null;
  for (let c = 1; c <= maxCols; c++) {
    const cell = row.getCell(c);
    if (text(cell).trim() === "") continue;
    const font = cell.font || {};
    const fill = cell.fill || {};
    fmt = {
      col: c,
      bold: !!font.bold,
      fg: fill?.fgColor?.argb,
      bgPattern: fill?.pattern,
      size: font.size,
      color: font.color?.argb,
    };
    break;
  }

  // Interesting signals: bold + relatively short text + few non-empty cells
  if (fmt?.bold && nonEmpty.length <= 3 && nonEmpty[0].length <= 50) {
    hits++;
    if (hits <= 80) {
      console.log(`R${String(r).padStart(4)} BOLD col${fmt.col} fill=${fmt.fg} :: ${nonEmpty.join(" | ")}`);
    }
  }
}
console.log(`${hits} bold+short rows found\n`);

// Also: scan every row from 60-120 raw to see mid-sheet structure
console.log("=== Rows 55 to 150 (raw) ===");
for (let r = 55; r <= Math.min(150, maxRow); r++) {
  const row = ws.getRow(r);
  const cells = [];
  for (let c = 1; c <= maxCols; c++) cells.push(text(row.getCell(c)).slice(0, 30));
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length === 0) {
    console.log(`R${String(r).padStart(4)}: (blank)`);
    continue;
  }
  console.log(`R${String(r).padStart(4)}: ${cells.map((x) => x.padEnd(18)).join(" | ")}`);
}
