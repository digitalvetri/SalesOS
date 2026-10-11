// Price-list import for the "PRICE LIST KI - KFM - 2026" format (spec §19 P1 prompt).
// Columns: PRODUCT, HP, DEALER PRICE w/o MOTOR, DEALER PRICE, CUSTOMER PRICE.
// Rows with a blank PRODUCT inherit the previous product's name (COPP-style variants).
// Category comes from section-heading rows (one bold cell, no numeric prices).
import type ExcelJS from "exceljs";
import Decimal from "decimal.js";

export type ParsedRow = {
  rowIndex: number;
  category: string;
  name: string;
  spec: string | null;
  dealerPriceWoMotor: Decimal | null;
  dealerPrice: Decimal | null;
  customerPrice: Decimal | null;
  issues: Issue[];
};

export type Issue =
  | "MISSING_CUSTOMER_PRICE"
  | "NO_PRICES"
  | "INHERITED_NAME"
  | "BLANK_SPEC_ALLOWED";

export type ParseResult = {
  rows: ParsedRow[];
  categories: string[];
  totals: {
    rows: number;
    withPrices: number;
    issues: Record<Issue, number>;
  };
};

const HEADER_KEYWORDS: Record<string, keyof Omit<ParsedRow, "rowIndex" | "category" | "issues">> = {
  PRODUCT: "name",
  HP: "spec",
  SPEC: "spec",
  "DEALER PRICE W/O MOTOR": "dealerPriceWoMotor",
  "DEALER PRICE WO MOTOR": "dealerPriceWoMotor",
  "DEALER PRICE W/O": "dealerPriceWoMotor",
  "DEALER PRICE": "dealerPrice",
  "CUSTOMER PRICE": "customerPrice",
};

/**
 * Parse an ExcelJS workbook with the pilot's price-list layout. Caller is responsible
 * for loading the file (`workbook.xlsx.readFile(path)` or `workbook.xlsx.load(buffer)`).
 */
export function parsePriceListWorkbook(workbook: ExcelJS.Workbook): ParseResult {
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      rows: [],
      categories: [],
      totals: { rows: 0, withPrices: 0, issues: emptyIssueCounts() },
    };
  }

  // Pass 1 — find the header row by keyword match, so we're robust to shifted columns.
  const header = findHeaderRow(sheet);
  if (!header) {
    throw new Error("Could not locate a header row (looked for PRODUCT / DEALER PRICE / CUSTOMER PRICE).");
  }

  const rows: ParsedRow[] = [];
  const categories = new Set<string>();
  const issueCounts = emptyIssueCounts();
  let currentCategory = "";
  let lastProductName = "";

  // Use rowCount (last-written-row). actualRowCount reports only through the last
  // dense row and can stop short of trailing product sections after a blank spacer.
  const maxRow = Math.min(Math.max(sheet.rowCount, sheet.actualRowCount ?? 0), 5000);
  for (let r = header.rowNumber + 1; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const cells = header.columns.map((col) => (col ? cellText(row.getCell(col)) : ""));
    const nameRaw = cells[0] ?? "";
    const specRaw = cells[1] ?? "";
    const dpwRaw = cells[2] ?? "";
    const dpRaw = cells[3] ?? "";
    const cpRaw = cells[4] ?? "";

    // Blank row — skip.
    if (![nameRaw, specRaw, dpwRaw, dpRaw, cpRaw].some((v) => v && v.length > 0)) continue;

    const dealerPriceWoMotor = parseDecimal(dpwRaw);
    const dealerPrice = parseDecimal(dpRaw);
    const customerPrice = parseDecimal(cpRaw);

    const hasAnyPrice =
      !!dealerPriceWoMotor || !!dealerPrice || !!customerPrice;

    // Section header: single text cell, no numeric prices. E.g. "WET GRINDERS".
    if (nameRaw && !hasAnyPrice && !specRaw) {
      currentCategory = normalizeCategory(nameRaw);
      categories.add(currentCategory);
      lastProductName = ""; // reset — different section
      continue;
    }

    const rowIssues: Issue[] = [];
    let name = nameRaw;
    if (!name) {
      if (lastProductName) {
        name = lastProductName;
        rowIssues.push("INHERITED_NAME");
      } else {
        // Can't form a product without a name and no predecessor — skip.
        continue;
      }
    } else {
      lastProductName = name;
    }

    if (!hasAnyPrice) {
      rowIssues.push("NO_PRICES");
    } else if (!customerPrice) {
      rowIssues.push("MISSING_CUSTOMER_PRICE");
    }

    rows.push({
      rowIndex: r,
      category: currentCategory || "Uncategorised",
      name,
      spec: specRaw || null,
      dealerPriceWoMotor,
      dealerPrice,
      customerPrice,
      issues: rowIssues,
    });

    for (const i of rowIssues) issueCounts[i]++;
  }

  return {
    rows,
    categories: Array.from(categories).concat(categories.has("Uncategorised") ? [] : []),
    totals: {
      rows: rows.length,
      withPrices: rows.filter((r) => r.customerPrice || r.dealerPrice).length,
      issues: issueCounts,
    },
  };
}

type HeaderInfo = { rowNumber: number; columns: (number | null)[] };

function findHeaderRow(sheet: ExcelJS.Worksheet): HeaderInfo | null {
  const maxScan = Math.min(50, sheet.actualRowCount ?? sheet.rowCount);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    const columnMap: Partial<Record<keyof typeof HEADER_KEYWORDS, number>> = {};
    const maxCol = Math.max(row.actualCellCount ?? 0, 20);
    for (let c = 1; c <= maxCol; c++) {
      const text = cellText(row.getCell(c)).toUpperCase().replace(/\s+/g, " ").trim();
      if (!text) continue;
      for (const kw of Object.keys(HEADER_KEYWORDS)) {
        if (text === kw) {
          columnMap[kw as keyof typeof HEADER_KEYWORDS] = c;
        }
      }
    }
    const nameCol = columnMap["PRODUCT"];
    const dealerCol = columnMap["DEALER PRICE"];
    const customerCol = columnMap["CUSTOMER PRICE"];
    if (nameCol && (dealerCol || customerCol)) {
      return {
        rowNumber: r,
        columns: [
          nameCol ?? null,
          columnMap["HP"] ?? columnMap["SPEC"] ?? null,
          columnMap["DEALER PRICE W/O MOTOR"] ??
            columnMap["DEALER PRICE WO MOTOR"] ??
            columnMap["DEALER PRICE W/O"] ??
            null,
          dealerCol ?? null,
          customerCol ?? null,
        ],
      };
    }
  }
  return null;
}

function cellText(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("text" in v && typeof (v as { text: unknown }).text === "string") {
      return ((v as { text: string }).text).trim();
    }
    if ("richText" in v && Array.isArray((v as { richText: unknown[] }).richText)) {
      return (v as { richText: Array<{ text: string }> }).richText
        .map((r) => r.text)
        .join("")
        .trim();
    }
    if ("result" in v) {
      const r = (v as { result: unknown }).result;
      if (typeof r === "number" || typeof r === "string") return String(r);
    }
    if ("formula" in v && "result" in v) {
      const r = (v as { result: unknown }).result;
      if (r !== null && r !== undefined) return String(r);
    }
  }
  return "";
}

function parseDecimal(raw: string): Decimal | null {
  const t = raw.replace(/[₹,\s]/g, "");
  if (!t) return null;
  if (/^(nil|nill|-|–)$/i.test(t)) return null;
  const d = new Decimal(t);
  if (d.isNaN()) return null;
  return d.isNegative() ? null : d;
}

function normalizeCategory(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function emptyIssueCounts(): Record<Issue, number> {
  return {
    MISSING_CUSTOMER_PRICE: 0,
    NO_PRICES: 0,
    INHERITED_NAME: 0,
    BLANK_SPEC_ALLOWED: 0,
  };
}

// ───────────── Commit — writes parsed rows into the DB ─────────────
import { prisma } from "@/server/repo/client";
import { createCategory, createProduct, updateProduct } from "@/server/services/productService";

export async function commitPriceList(opts: {
  tenantId: string;
  actorId: string;
  parsed: ParseResult;
}) {
  let created = 0;
  let updated = 0;

  // Build/get categories
  const existingCategories = await prisma.productCategory.findMany({
    where: { tenantId: opts.tenantId },
    select: { id: true, name: true },
  });
  const catByName = new Map(existingCategories.map((c) => [c.name.toLowerCase(), c.id]));

  for (const name of opts.parsed.categories) {
    if (!catByName.has(name.toLowerCase())) {
      const cat = await createCategory({
        tenantId: opts.tenantId,
        actorId: opts.actorId,
        name,
      });
      catByName.set(name.toLowerCase(), cat.id);
    }
  }

  // Build/update products — match on (tenantId, name, spec) composite.
  for (const row of opts.parsed.rows) {
    const categoryId =
      catByName.get(row.category.toLowerCase()) ??
      (
        await createCategory({
          tenantId: opts.tenantId,
          actorId: opts.actorId,
          name: row.category,
        })
      ).id;

    const existing = await prisma.product.findFirst({
      where: {
        tenantId: opts.tenantId,
        name: row.name,
        spec: row.spec,
      },
    });

    if (existing) {
      await updateProduct({
        tenantId: opts.tenantId,
        actorId: opts.actorId,
        id: existing.id,
        categoryId,
        dealerPriceWoMotor: row.dealerPriceWoMotor?.toString() ?? null,
        dealerPrice: row.dealerPrice?.toString() ?? null,
        customerPrice: row.customerPrice?.toString() ?? null,
      });
      updated++;
    } else {
      await createProduct({
        tenantId: opts.tenantId,
        actorId: opts.actorId,
        categoryId,
        name: row.name,
        spec: row.spec,
        dealerPriceWoMotor: row.dealerPriceWoMotor?.toString() ?? null,
        dealerPrice: row.dealerPrice?.toString() ?? null,
        customerPrice: row.customerPrice?.toString() ?? null,
      });
      created++;
    }
  }

  return { created, updated, totalRows: opts.parsed.rows.length };
}
