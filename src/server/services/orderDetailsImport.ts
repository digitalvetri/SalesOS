// Import of the KI/KFM "ORDER DETAILS.xlsx" workbook (v1.1 data model):
//   - one sheet per salesperson  → that employee's orders (S.No, paid, status)
//   - "PRICE LIST …" sheet       → product catalogue (categories by name keywords)
//   - excluded sheets            → skipped (e.g. MURUGAN, TURBO ORDER)
//
// planOrderDetailsImport() is pure (no DB) and powers the dry-run report;
// commitOrderDetailsImport() writes it. Idempotent: every order carries
// importRef = "<SHEET>!R<row>", so re-running skips what is already there.
//
// Business rules agreed with the client (2026-10-13):
//   - BAL "NILL" → fully paid; BAL number → paid = total − balance.
//   - BAL blank  → fully unpaid (paid 0) and Pending.
//   - No amount  → Pending with a ₹1 placeholder total and a note to fix it.
//   - Employees  → <sheet name>@gmail.com, temporary password set by the caller.
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { prisma } from "@/server/repo/client";
import { parseOrderBook, type ParsedOrder, type RawCell, type SheetGrid } from "@/server/domain/import/orderBook";
import { categoryFor } from "@/server/domain/import/productCategories";
import { parsePriceListWorkbook, commitPriceList, type ParseResult as PriceParse } from "@/server/services/priceListImport";
import { insertOrderV2Tx } from "@/server/services/orderV2Service";
import { hashPassword } from "@/server/auth/password";

export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";

export type PlannedEmployee = { sheet: string; name: string; email: string; orders: number };

export type PlannedOrder = {
  ref: string;
  sheet: string;
  date: string; // YYYY-MM-DD
  customerName: string;
  phone: string | null; // 10-digit Indian mobile, or null
  productText: string;
  total: string;
  paid: string;
  balance: string;
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  method: PaymentMethod;
  entityCode: "KI" | "KFM";
  note: string | null;
  priceMissing: boolean;
  flags: string[];
};

export type ImportPlan = {
  employees: PlannedEmployee[];
  orders: PlannedOrder[];
  products: PriceParse | null;
  excludedSheets: string[];
};

export type PlanOptions = {
  excludeSheets: string[]; // case-insensitive sheet names to skip
  latest: string; // YYYY-MM-DD — no order date may be later (today, IST)
  emailDomain?: string; // default gmail.com
  placeholderTotal?: string; // default "1"
};

// ───────────────────────── reading ─────────────────────────

export function worksheetGrid(ws: ExcelJS.Worksheet): RawCell[][] {
  const rows: RawCell[][] = [];
  const max = Math.max(ws.rowCount, ws.actualRowCount ?? 0);
  for (let r = 1; r <= max; r++) {
    const row = ws.getRow(r);
    const out: RawCell[] = [];
    const cols = Math.max(row.actualCellCount ?? 0, ws.actualColumnCount ?? 0);
    for (let c = 1; c <= cols; c++) {
      const v = row.getCell(c).value as unknown;
      if (v === null || v === undefined) out.push(null);
      else if (v instanceof Date || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out.push(v);
      else if (typeof v === "object" && v !== null && ("formula" in v || "sharedFormula" in v)) {
        const f = v as { formula?: string; sharedFormula?: string; result?: unknown };
        const res = f.result;
        out.push({
          formula: f.formula ?? f.sharedFormula ?? "",
          result: res instanceof Date || typeof res === "string" || typeof res === "number" ? res : null,
        });
      } else if (typeof v === "object" && v !== null && "richText" in v) {
        out.push((v as { richText: { text: string }[] }).richText.map((p) => p.text).join(""));
      } else if (typeof v === "object" && v !== null && "text" in v) out.push(String((v as { text: unknown }).text));
      else out.push(null);
    }
    rows.push(out);
  }
  return rows;
}

const isPriceSheet = (name: string) => /^\s*price/i.test(name);
const titleCase = (s: string) => s.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** "1/4" typed in the HP column is turned into a date by Excel — read it back as a fraction. */
export function fixSpec(spec: string | null): string | null {
  if (!spec) return spec;
  const m = /^(\d{4})-(\d{2})-(\d{2})T/.exec(spec);
  return m ? `${Number(m[2])}/${Number(m[3])} HP` : spec;
}

export function paymentMethodFor(route: string | null): PaymentMethod {
  const r = (route ?? "").toLowerCase();
  if (/cheque|chq/.test(r)) return "CHEQUE";
  if (/g\s*\.?\s*pay|upi|phone\s*pe|paytm|scanner/.test(r)) return "UPI";
  if (/cash/.test(r)) return "CASH";
  if (/\bacc|a\/c|bank|neft|rtgs|imps|\bkfm\b|\bki\b/.test(r)) return "BANK_TRANSFER";
  return "UPI";
}

const entityFor = (route: string | null): "KI" | "KFM" => (/\bkfm\b/i.test(route ?? "") ? "KFM" : "KI");

const mobile = (raw: string | null): string | null => {
  const d = (raw ?? "").replace(/\D/g, "");
  const ten = d.length === 12 && d.startsWith("91") ? d.slice(2) : d;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
};

// ───────────────────────── planning (pure) ─────────────────────────

export function planOrder(o: ParsedOrder, opts: { placeholderTotal: string }): PlannedOrder {
  const amount = new Decimal(o.amount || "0");
  const priceMissing = !amount.greaterThan(0);
  const total = priceMissing ? new Decimal(opts.placeholderTotal) : amount;

  let paid = new Decimal(0);
  let status: PlannedOrder["status"] = "PENDING";
  let note: string | null = null;
  if (priceMissing) {
    note = "Price missing in the Excel sheet — please update the total.";
  } else if (o.balanceStated) {
    const bal = Decimal.min(Decimal.max(new Decimal(o.balance || "0"), 0), total);
    paid = total.minus(bal);
    status = o.status === "CANCELLED" ? "CANCELLED" : o.status === "DELIVERED" || o.status === "CLOSED" ? "COMPLETED" : "PENDING";
  } else {
    // Blank BAL: agreed rule — record as fully unpaid and Pending.
    status = o.status === "CANCELLED" ? "CANCELLED" : "PENDING";
  }
  if (o.cancelNote) note = [note, `Cancelled: ${o.cancelNote}`].filter(Boolean).join(" ");

  const productText = (o.lines.join(", ").replace(/\s+/g, " ").trim() || "(not specified in sheet)").slice(0, 500);
  return {
    ref: o.ref,
    sheet: o.sheet,
    date: o.date,
    customerName: o.customerName.trim().slice(0, 120) || "Unknown",
    phone: mobile(o.phone),
    productText,
    total: total.toFixed(2),
    paid: paid.toFixed(2),
    balance: total.minus(paid).toFixed(2),
    status,
    method: paymentMethodFor(o.route),
    entityCode: entityFor(o.route),
    note,
    priceMissing,
    flags: o.flags,
  };
}

export async function planOrderDetailsImport(file: Buffer | ArrayBuffer, opts: PlanOptions): Promise<ImportPlan> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file as ArrayBuffer);
  const excluded = new Set(opts.excludeSheets.map((s) => s.trim().toUpperCase()));
  const domain = opts.emailDomain ?? "gmail.com";

  const orderSheets: SheetGrid[] = wb.worksheets
    .filter((ws) => !isPriceSheet(ws.name) && !excluded.has(ws.name.trim().toUpperCase()))
    .map((ws) => ({ name: ws.name.trim().toUpperCase(), rows: worksheetGrid(ws) }));

  const parsed = parseOrderBook(orderSheets, { latest: opts.latest });
  const orders = parsed.orders.map((o) => planOrder(o, { placeholderTotal: opts.placeholderTotal ?? "1" }));

  const employees: PlannedEmployee[] = orderSheets.map((s) => ({
    sheet: s.name,
    name: titleCase(s.name),
    email: `${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "")}@${domain}`,
    orders: orders.filter((o) => o.sheet === s.name).length,
  }));

  // Price list: parse just that sheet, then fix Excel-mangled specs and assign categories.
  let products: PriceParse | null = null;
  const priceWs = wb.worksheets.find((ws) => isPriceSheet(ws.name));
  if (priceWs) {
    const only = new ExcelJS.Workbook();
    await only.xlsx.load(file as ArrayBuffer);
    for (const ws of [...only.worksheets]) if (!isPriceSheet(ws.name)) only.removeWorksheet(ws.id);
    const p = parsePriceListWorkbook(only);
    const rows = p.rows.map((r) => ({ ...r, spec: fixSpec(r.spec), category: categoryFor(r.name) }));
    products = { ...p, rows, categories: [...new Set(rows.map((r) => r.category))].sort() };
  }

  return {
    employees,
    orders,
    products,
    excludedSheets: wb.worksheets.map((ws) => ws.name.trim()).filter((n) => excluded.has(n.toUpperCase())),
  };
}

// ───────────────────────── commit ─────────────────────────

export type CommitSummary = {
  employeesCreated: string[];
  employeesExisting: string[];
  products: { created: number; updated: number } | null;
  customersCreated: number;
  ordersCreated: number;
  ordersSkippedExisting: number;
  paymentsCreated: number;
};

export async function commitOrderDetailsImport(
  plan: ImportPlan,
  ctx: { tenantId: string; actorId: string; employeePassword: string },
): Promise<CommitSummary> {
  const summary: CommitSummary = {
    employeesCreated: [],
    employeesExisting: [],
    products: null,
    customersCreated: 0,
    ordersCreated: 0,
    ordersSkippedExisting: 0,
    paymentsCreated: 0,
  };

  const entities = await prisma.billingEntity.findMany({ where: { tenantId: ctx.tenantId }, select: { id: true, code: true } });
  const entityByCode = new Map(entities.map((e) => [e.code, e]));
  const fallbackEntity = entityByCode.get("KI") ?? entities[0];
  if (!fallbackEntity) throw new Error("No billing entity (KI/KFM) exists for this tenant.");

  // 1) Employees (SALES), matched by email. Existing logins are left untouched.
  const passwordHash = await hashPassword(ctx.employeePassword);
  const userBySheet = new Map<string, string>();
  for (const [i, e] of plan.employees.entries()) {
    const existing = await prisma.user.findFirst({ where: { tenantId: ctx.tenantId, email: e.email }, select: { id: true } });
    if (existing) {
      userBySheet.set(e.sheet, existing.id);
      summary.employeesExisting.push(e.email);
      continue;
    }
    // Placeholder contact number (unique per tenant) — the admin replaces it.
    let n = i + 1;
    let phone = `+91900000${String(n).padStart(4, "0")}`;
    while (await prisma.user.findFirst({ where: { tenantId: ctx.tenantId, phoneE164: phone }, select: { id: true } })) {
      n += 100;
      phone = `+91900000${String(n).padStart(4, "0")}`;
    }
    const u = await prisma.user.create({
      data: {
        tenantId: ctx.tenantId,
        name: e.name,
        email: e.email,
        phoneE164: phone,
        role: "SALES",
        canReceivePayments: true,
        defaultEntityId: fallbackEntity.id,
        passwordHash,
        passwordSetAt: new Date(),
      },
      select: { id: true },
    });
    userBySheet.set(e.sheet, u.id);
    summary.employeesCreated.push(e.email);
  }

  // 2) Products (upsert by name + spec, through the catalogue service).
  if (plan.products) {
    const r = await commitPriceList({ tenantId: ctx.tenantId, actorId: ctx.actorId, parsed: plan.products });
    summary.products = { created: r.created, updated: r.updated };
  }

  // 3) Orders — per salesperson in date order, so S.No follows the order dates.
  const done = new Set(
    (await prisma.order.findMany({
      where: { tenantId: ctx.tenantId, importRef: { in: plan.orders.map((o) => o.ref) } },
      select: { importRef: true },
    })).map((o) => o.importRef),
  );
  const customerByPhone = new Map<string, string>();
  const sorted = [...plan.orders].sort((a, b) => a.sheet.localeCompare(b.sheet) || a.date.localeCompare(b.date) || rowNo(a.ref) - rowNo(b.ref));

  for (const o of sorted) {
    if (done.has(o.ref)) {
      summary.ordersSkippedExisting++;
      continue;
    }
    const salespersonId = userBySheet.get(o.sheet)!;
    const customerId = await ensureCustomer(ctx.tenantId, salespersonId, o, customerByPhone, summary);
    const entity = entityByCode.get(o.entityCode) ?? fallbackEntity;
    const orderDate = new Date(`${o.date}T00:00:00.000Z`);
    const paid = new Decimal(o.paid);
    await prisma.$transaction(async (tx) => {
      await insertOrderV2Tx(tx, {
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        salespersonId,
        customerId,
        entity,
        orderDate,
        productText: o.productText,
        total: new Decimal(o.total),
        advance: paid,
        paymentMethod: o.method,
        note: o.note,
        simpleStatus: o.status,
        legacyStatus: o.status === "COMPLETED" ? "DELIVERED" : o.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
        completedAt: o.status === "COMPLETED" ? orderDate : null,
        importRef: o.ref,
      });
    });
    summary.ordersCreated++;
    if (paid.greaterThan(0)) summary.paymentsCreated++;
  }
  return summary;
}

const rowNo = (ref: string) => Number(ref.split("!R")[1] ?? 0);

async function ensureCustomer(
  tenantId: string,
  ownerUserId: string,
  o: PlannedOrder,
  cache: Map<string, string>,
  summary: CommitSummary,
): Promise<string> {
  // Same phone = same customer (across sheets). No phone → one customer per order.
  const phoneE164 = o.phone ? `+91${o.phone}` : `+91-import-${o.ref.replace(/[^A-Za-z0-9]/g, "")}`;
  const hit = cache.get(phoneE164);
  if (hit) return hit;
  const existing = await prisma.customer.findUnique({
    where: { tenantId_phoneE164: { tenantId, phoneE164 } },
    select: { id: true },
  });
  const id =
    existing?.id ??
    (await prisma.customer.create({ data: { tenantId, phoneE164, name: o.customerName, ownerUserId }, select: { id: true } })).id;
  if (!existing) summary.customersCreated++;
  cache.set(phoneE164, id);
  return id;
}
