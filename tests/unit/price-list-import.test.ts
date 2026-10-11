// Exercises parsePriceListWorkbook against synthetic xlsx workbooks that mimic
// the real "PRICE LIST KI - KFM - 2026" shape: section-heading rows, blank-name
// continuation ("COPP"-style variants), and ad-hoc column shuffling.
import { describe, it, expect, beforeAll } from "vitest";
import ExcelJS from "exceljs";
import { parsePriceListWorkbook } from "@/server/services/priceListImport";

async function sheetFromRows(rows: (string | number | null)[][]): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Prices");
  for (const r of rows) {
    ws.addRow(r.map((v) => (v === null ? "" : v)));
  }
  const buf = await wb.xlsx.writeBuffer();
  const roundTrip = new ExcelJS.Workbook();
  await roundTrip.xlsx.load(buf);
  return roundTrip;
}

describe("parsePriceListWorkbook", () => {
  let standard: ExcelJS.Workbook;

  beforeAll(async () => {
    // Format mirrors the pilot sheet: title row → column header → category section.
    // The parser locates the column header by keyword match; single-text rows below
    // it become section headings.
    standard = await sheetFromRows([
      ["SalesOS test price list"],
      [],
      ["PRODUCT", "HP", "DEALER PRICE w/o MOTOR", "DEALER PRICE", "CUSTOMER PRICE"],
      ["WET GRINDERS"],
      ["10L Tilting Wet Grinder", "1 HP", 24000, 28000, 32000],
      ["", "1.5 HP", 26000, 30500, 34500], // blank-name continuation
      ["", "2 HP", 28000, 32500, 37000],
      ["15L Tilting Wet Grinder", "1 HP", 29000, 33500, 38500],
      [],
      ["TURBO STOVES"],
      ["3kg Turbo Stove", "", 14000, 16500, 18500],
      ["5kg Turbo Stove", "", 18000, 20500, 23500],
    ]);
  });

  it("detects a header row by keyword match (robust to shifted sections)", async () => {
    const result = parsePriceListWorkbook(standard);
    expect(result.totals.rows).toBeGreaterThanOrEqual(6);
  });

  it("captures categories from section-heading rows", async () => {
    const result = parsePriceListWorkbook(standard);
    expect(result.categories).toContain("Wet Grinders");
    expect(result.categories).toContain("Turbo Stoves");
  });

  it("inherits the previous product name on blank-name rows", async () => {
    const result = parsePriceListWorkbook(standard);
    const inherited = result.rows.filter((r) => r.issues.includes("INHERITED_NAME"));
    expect(inherited.length).toBe(2);
    expect(inherited.every((r) => r.name === "10L Tilting Wet Grinder")).toBe(true);
    expect(inherited[0]!.spec).toBe("1.5 HP");
    expect(inherited[1]!.spec).toBe("2 HP");
  });

  it("parses numbers correctly, ignores ₹/commas/NILL in prices", async () => {
    const wb = await sheetFromRows([
      ["PRODUCT", "HP", "DEALER PRICE w/o MOTOR", "DEALER PRICE", "CUSTOMER PRICE"],
      ["Alpha", "1 HP", "₹10,500", "12,000", "NILL"],
      ["Beta", "2 HP", "", "", 15000],
    ]);
    const result = parsePriceListWorkbook(wb);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]!.dealerPriceWoMotor?.toNumber()).toBe(10500);
    expect(result.rows[0]!.dealerPrice?.toNumber()).toBe(12000);
    expect(result.rows[0]!.customerPrice).toBeNull();
    expect(result.rows[0]!.issues).toContain("MISSING_CUSTOMER_PRICE");

    expect(result.rows[1]!.dealerPrice).toBeNull();
    expect(result.rows[1]!.customerPrice?.toNumber()).toBe(15000);
  });

  it("skips blank rows (no field has content)", async () => {
    const wb = await sheetFromRows([
      ["PRODUCT", "HP", "DEALER PRICE w/o MOTOR", "DEALER PRICE", "CUSTOMER PRICE"],
      ["Alpha", "1 HP", 1000, 2000, 3000],
      ["", "", "", "", ""],
      ["", "", "", "", ""],
      ["Beta", "", 2000, 3000, 4000],
    ]);
    const result = parsePriceListWorkbook(wb);
    expect(result.rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("tolerates header rows that are the first non-empty row", async () => {
    const wb = await sheetFromRows([
      ["PRODUCT", "HP", "DEALER PRICE", "CUSTOMER PRICE"],
      ["Alpha", "1 HP", 10000, 12000],
    ]);
    const result = parsePriceListWorkbook(wb);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.name).toBe("Alpha");
    expect(result.rows[0]!.dealerPrice?.toNumber()).toBe(10000);
    expect(result.rows[0]!.customerPrice?.toNumber()).toBe(12000);
  });

  it("throws when no header row is found in the first 50 rows", async () => {
    const wb = await sheetFromRows([
      ["Random label"],
      ["Not a header"],
    ]);
    expect(() => parsePriceListWorkbook(wb)).toThrow(/header row/i);
  });
});
