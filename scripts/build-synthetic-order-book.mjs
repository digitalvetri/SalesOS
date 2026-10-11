// Builds a synthetic ORDER_DETAILS.xlsx that exercises every §15.1 parser rule:
// repeated headers, month markers, TOTAL rows, swapped dd-mm dates, text + Excel
// serial dates, phone-in-name, NILL / formulas, multi-row orders, cross-sheet
// duplicates, cancel notes. Output: fixtures/synthetic-order-book.xlsx.
import ExcelJS from "exceljs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(__dirname, "..", "fixtures", "synthetic-order-book.xlsx");

const wb = new ExcelJS.Workbook();
wb.creator = "SalesOS synthetic fixture";
wb.created = new Date();

const HEADER = ["DATE", "CUSTOMER", "PH NO", "PRODUCT", "AMOUNT", "ADV", "BAL", "STATUS", "ROUTE"];

/** VIJI sheet — real-world messiness: swapped dates, phone-in-name, multi-row, NILL, cancel, formulas. */
const viji = wb.addWorksheet("VIJI");
viji.addRow(["VIJI SHEET — 2026"]);
viji.addRow([]);
viji.addRow([new Date(Date.UTC(2026, 0, 1))]); // January block marker
viji.addRow(HEADER);
viji.addRow(["07.01.2026", "Gokul", "9843700001", "10L Tilting Wet Grinder", 32000, 10000, 22000, "DELIVERED", "KFM CA"]);
// Multi-row order: amount lands on the last line
viji.addRow(["09.01.2026", "SRI PACK", "9843700002", "6 inch IRG"]);
viji.addRow([null, null, null, "SS table 5x2 per sketch"]);
viji.addRow([null, null, null, "Installation", 65000, 20000, 45000, "DELIVERED", "KUMARESH GPAY"]);
// Phone sits in the name column
viji.addRow(["12.01.2026", "9876543210", null, "15kg Potato Peeler", 24000, "NILL", 24000, "PENDING", "CASH"]);
// Status cancel with reason in the row text
viji.addRow(["15.01.2026", "Rew", "9843700004", "10kg Grinder — cancel delivery delay", 18500, 5000, 13500, "", "KFM CA"]);
// Formula amount
viji.addRow(["20.01.2026", "AKCHAYA", "9843700005", "Vada Machine", { formula: "=23500*1", result: 23500 }, 23500, 0, "DELIVERED", "KI CA"]);
// Day-first swap: Excel date 2026-05-01 but block is January → should swap to 2026-01-05
viji.addRow([new Date(Date.UTC(2026, 4, 1)), "Priya", "9843700006", "Dosa Batter Mixer", 18000, 9000, 9000, "PENDING", "KFM CA"]);
viji.addRow(["TOTAL", null, null, null, 158500]);

viji.addRow([]);
viji.addRow([new Date(Date.UTC(2026, 1, 1))]); // February block marker
viji.addRow(HEADER);
viji.addRow(["03.02.2026", "Nallamuthu", "9843700007", "Big Wet Grinder 25L", 170000, 50000, 120000, "DELIVERED", "KUMARESH GPAY"]);
viji.addRow(["08.02.2026", "RAM PEDDI", "9843700008", "Vada Machine x2", 48000, 48000, 0, "DELIVERED", "KFM CA"]);
viji.addRow(["TOTAL", null, null, null, 218000]);

/** MALLIKA sheet — contains the Nallamuthu duplicate across sheets (§15.1). */
const mallika = wb.addWorksheet("MALLIKA");
mallika.addRow(["MALLIKA — 2026"]);
mallika.addRow([]);
mallika.addRow([new Date(Date.UTC(2026, 1, 1))]);
mallika.addRow(HEADER);
mallika.addRow(["05.02.2026", "Nallamuthu", "9843700007", "Big Wet Grinder 25L", 170000, 50000, 120000, "DELIVERED", "KUMARESH GPAY"]); // DUPLICATE of VIJI's row
mallika.addRow(["11.02.2026", "SWAADA FOODS", "9843700009", "Pulverizer 2HP", 42000, 20000, 22000, "PARTIAL DELIVERY", "KFM CA"]);
mallika.addRow(["TOTAL", null, null, null, 212000]);

/** TURBO ORDER sheet — product tracker, should be Skipped at import time. */
const turbo = wb.addWorksheet("TURBO ORDER");
turbo.addRow(["TURBO STOVES — product tracker (skip)"]);
turbo.addRow(["Model", "Qty", "Notes"]);
turbo.addRow(["3kg Turbo Stove", 5, "Reorder — oil seals"]);
turbo.addRow(["5kg Turbo Stove", 3, "Painting backlog"]);

await wb.xlsx.writeFile(out);
console.log(`Wrote ${out}`);
