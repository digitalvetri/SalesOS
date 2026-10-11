// Extract just the first sheet ("PRICE LIST KI - KFM - 2026") from the pilot
// ORDER_DETAILS.xlsx into its own file for upload to /catalogue/import.
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(__dirname, "..", "fixtures", "ORDER_DETAILS.xlsx");
const dst = path.resolve(__dirname, "..", "fixtures", "price-list.xlsx");

const srcWb = new ExcelJS.Workbook();
await srcWb.xlsx.readFile(src);
const first = srcWb.worksheets[0];
if (!first) throw new Error("No sheets found in source");
console.log(`Source sheet: "${first.name}" (${first.rowCount} rows × ${first.actualColumnCount ?? "?"} cols)`);

const outWb = new ExcelJS.Workbook();
outWb.creator = "SalesOS extract";
outWb.created = new Date();
const outWs = outWb.addWorksheet(first.name);

// Copy every row cell-by-cell to preserve formulas, dates, and strings.
const maxRow = Math.max(first.rowCount, first.actualRowCount ?? 0);
const maxCol = Math.max(first.actualColumnCount ?? 0, 10);
for (let r = 1; r <= maxRow; r++) {
  const srcRow = first.getRow(r);
  const outRow = outWs.getRow(r);
  for (let c = 1; c <= maxCol; c++) {
    const srcCell = srcRow.getCell(c);
    outRow.getCell(c).value = srcCell.value;
  }
  if (srcRow.height) outRow.height = srcRow.height;
}

// Copy column widths roughly.
for (let c = 1; c <= maxCol; c++) {
  const w = first.getColumn(c).width;
  if (w) outWs.getColumn(c).width = w;
}

await outWb.xlsx.writeFile(dst);
console.log(`Wrote ${dst}`);
