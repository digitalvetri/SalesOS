// Import of the KI/KFM "ORDER DETAILS.xlsx" workbook (v1.1 data model):
//   - one sheet per salesperson  → that employee's orders (S.No, paid, status)
//   - "PRICE LIST …" sheet       → product catalogue (categories by name keywords)
//   - excluded sheets            → skipped (e.g. TURBO ORDER)
//
// planOrderDetailsImport() is pure (no DB) and powers the dry-run report;
// commitOrderDetailsImport() writes it. Idempotent: every order carries
// importRef = "<SHEET>!R<row>", so re-running skips what is already there.
//
// Business rules agreed with the client (2026-10-13):
//   - Exactly what the sheet says: an empty phone / amount / name stays empty
//     (no placeholders); the row as typed is kept on the order (Order.sheetRow).
//   - Paid comes from TOTAL / ADV / BAL (see orderBook.ts). When ADV and BAL are
//     both empty the sheet doesn't say → `unrecordedPayment` decides; the client's
//     rule is PAID_IF_DELIVERED (paid when STATUS says delivered/completed).
//   - Completed = delivered/closed and nothing left to pay; cancelled stays cancelled.
//   - Employees → <sheet name>@gmail.com, temporary password set by the caller.
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import {
  parseOrderBook,
  type MonthTotal,
  type ParsedOrder,
  type RawCell,
  type SheetGrid,
  type SkippedRow,
} from "@/server/domain/import/orderBook";
import type { SheetRow } from "@/server/domain/import/sheetRow";
import { categoryFor } from "@/server/domain/import/productCategories";
import { parsePriceListWorkbook, commitPriceList, type ParseResult as PriceParse } from "@/server/services/priceListImport";
import { insertOrderV2Tx } from "@/server/services/orderV2Service";
import { hashPassword } from "@/server/auth/password";

export type PaymentMethod = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";

/** What to record when a row has neither ADV nor BAL. */
export type UnrecordedPayment = "UNPAID" | "PAID_IF_ACCOUNT" | "PAID_IF_DELIVERED";

export type PlannedEmployee = { sheet: string; name: string; email: string; orders: number };

export type PlannedOrder = {
  ref: string;
  sheet: string;
  date: string; // YYYY-MM-DD
  customerName: string; // "" when the row has no name
  phone: string | null; // 10-digit Indian mobile, or null
  altPhone: string | null;
  productText: string; // "" when the row has no product
  total: string; // "0.00" when totalMissing
  totalMissing: boolean;
  paid: string;
  balance: string;
  paymentRecorded: boolean; // false = ADV and BAL were empty in the sheet
  status: "PENDING" | "DELIVERED" | "CANCELLED";
  method: PaymentMethod;
  entityCode: "KI" | "KFM";
  note: string | null; // the sheet's comments / remarks
  cancelNote: string | null;
  deliveryDate: string | null;
  flags: string[];
  sheetRow: SheetRow;
};

export type ImportPlan = {
  employees: PlannedEmployee[];
  orders: PlannedOrder[];
  products: PriceParse | null;
  excludedSheets: string[];
  reconciliation: MonthTotal[];
  skipped: SkippedRow[];
};

export type PlanOptions = {
  excludeSheets: string[]; // case-insensitive sheet names to skip
  latest: string; // YYYY-MM-DD — no order date may be later (today, IST)
  emailDomain?: string; // default gmail.com
  unrecordedPayment?: UnrecordedPayment; // default UNPAID
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
  if (/\bacc|a\/c|bank|neft|rtgs|imps|\bkfm\b|\bki\b|\bca\b|\bcac\b/.test(r)) return "BANK_TRANSFER";
  return "UPI";
}

const entityFor = (route: string | null): "KI" | "KFM" => (/\bkfm/i.test(route ?? "") ? "KFM" : "KI");

// ───────────────────────── planning (pure) ─────────────────────────

/** Client rule (2026-10-13): no ADV/BAL but the sheet says delivered/completed → paid. */
const DONE_RE = /deliver|complete/i;

export function planOrder(o: ParsedOrder, opts: { unrecordedPayment?: UnrecordedPayment } = {}): PlannedOrder {
  const totalMissing = o.amountMissing;
  const total = totalMissing ? new Decimal(0) : new Decimal(o.amount);
  const paymentRecorded = o.paid !== null;

  let paid: Decimal;
  if (o.paid !== null) paid = new Decimal(o.paid);
  else if (opts.unrecordedPayment === "PAID_IF_ACCOUNT" && o.route) paid = total; // money went to a named account
  else if (opts.unrecordedPayment === "PAID_IF_DELIVERED" && DONE_RE.test(o.sheetRow.status ?? "")) paid = total; // the sheet says delivered/completed
  else paid = new Decimal(0);
  // Never more than the total (except when there is no total yet: keep the money received).
  if (!totalMissing) paid = Decimal.min(Decimal.max(paid, 0), total);
  const balance = totalMissing ? new Decimal(0) : total.minus(paid);

  const cancelled = o.status === "CANCELLED";
  const doneByStatus = o.status === "DELIVERED" || o.status === "CLOSED";
  const status: PlannedOrder["status"] = cancelled
    ? "CANCELLED"
    : !totalMissing && balance.isZero() && doneByStatus && (paymentRecorded || paid.gt(0))
      ? "DELIVERED"
      : "PENDING";

  return {
    ref: o.ref,
    sheet: o.sheet,
    date: o.date,
    customerName: o.customerName.trim().slice(0, 120),
    phone: o.phone,
    altPhone: o.altPhone,
    productText: o.lines.join(", ").replace(/\s+/g, " ").trim().slice(0, 500),
    total: total.toFixed(2),
    totalMissing,
    paid: paid.toFixed(2),
    balance: balance.toFixed(2),
    paymentRecorded,
    status,
    method: paymentMethodFor(o.route),
    entityCode: entityFor(o.route),
    note: o.comments ? o.comments.slice(0, 1000) : null,
    cancelNote: cancelled ? (o.cancelNote ?? "Cancelled").slice(0, 300) : null,
    deliveryDate: o.deliveryDate,
    flags: o.flags,
    sheetRow: o.sheetRow,
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
  const orders = parsed.orders.map((o) => planOrder(o, { unrecordedPayment: opts.unrecordedPayment }));

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
    reconciliation: parsed.reconciliation,
    skipped: parsed.skipped ?? [],
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
    // Placeholder contact number for the login (unique per tenant) — the admin replaces it.
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
  const customers = new Map<string, string>();
  const sorted = [...plan.orders].sort((a, b) => a.sheet.localeCompare(b.sheet) || a.date.localeCompare(b.date) || rowNo(a.ref) - rowNo(b.ref));

  for (const o of sorted) {
    if (done.has(o.ref)) {
      summary.ordersSkippedExisting++;
      continue;
    }
    const salespersonId = userBySheet.get(o.sheet)!;
    const customerId = await ensureCustomer(ctx.tenantId, salespersonId, o, customers, summary);
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
        productText: o.productText || null,
        total: new Decimal(o.total),
        advance: paid,
        paymentMethod: o.method,
        paymentNote: o.sheetRow.acc,
        accDetails: o.sheetRow.acc,
        note: o.note,
        simpleStatus: o.status,
        legacyStatus: o.status === "DELIVERED" ? "DELIVERED" : o.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
        completedAt: o.status === "DELIVERED" ? orderDate : null,
        importRef: o.ref,
        totalMissing: o.totalMissing,
        sheetRow: o.sheetRow as unknown as Prisma.InputJsonValue,
        promisedDeliveryDate: o.deliveryDate ? new Date(`${o.deliveryDate}T00:00:00.000Z`) : null,
        cancelNote: o.cancelNote,
      });
    }, { timeout: 60_000, maxWait: 20_000 }); // the import may run over a slow remote link
    summary.ordersCreated++;
    if (paid.greaterThan(0)) summary.paymentsCreated++;
  }
  return summary;
}

const rowNo = (ref: string) => Number(ref.split("!R")[1] ?? 0);
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Same mobile = same customer (across sheets). No mobile: the same name for the same
 * salesperson is one customer; no name and no mobile → a customer of its own.
 */
async function ensureCustomer(
  tenantId: string,
  ownerUserId: string,
  o: PlannedOrder,
  cache: Map<string, string>,
  summary: CommitSummary,
): Promise<string> {
  const phoneE164 = o.phone ? `+91${o.phone}` : null;
  const key = phoneE164 ? `p:${phoneE164}` : normName(o.customerName) ? `n:${ownerUserId}:${normName(o.customerName)}` : null;
  if (key) {
    const hit = cache.get(key);
    if (hit) return hit;
  }
  if (phoneE164) {
    const existing = await prisma.customer.findUnique({ where: { tenantId_phoneE164: { tenantId, phoneE164 } }, select: { id: true } });
    if (existing) {
      cache.set(key!, existing.id);
      return existing.id;
    }
  }
  const created = await prisma.customer.create({
    data: {
      tenantId,
      phoneE164,
      altPhone: o.altPhone ? `+91${o.altPhone}` : null,
      name: o.customerName,
      ownerUserId,
    },
    select: { id: true },
  });
  summary.customersCreated++;
  if (key) cache.set(key, created.id);
  return created.id;
}
