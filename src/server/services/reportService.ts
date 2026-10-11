// §11.14 Excel reports. Every workbook: one header row, frozen panes, ₹ number
// format `[$₹-4009] #,##,##0`, dates `DD-MMM-YYYY`, generated server-side with
// exceljs. Sales users get their own orders only (§4.2 "Export reports 👤").
import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { overdueInfo } from "@/server/domain/payment/collect";
import { istDateString } from "@/server/domain/payment/record";
import { agingBucket, AGING_BUCKETS } from "@/server/domain/dashboard/period";
import { salesLeaderboard, topProducts } from "@/server/services/dashboardService";

export const MONEY_FMT = "[$₹-4009] #,##,##0";
export const DATE_FMT = "DD-MMM-YYYY";

export const REPORTS = [
  "sales-register",
  "collections",
  "outstanding",
  "salesperson-performance",
  "cash-with-staff",
  "cancellations",
  "product-sales",
] as const;
export type ReportKind = (typeof REPORTS)[number];

export type ReportScope = {
  tenantId: string;
  from: string; // YYYY-MM-DD (IST business dates)
  to: string;
  entityId?: string;
  salespersonScope?: string; // Sales: own orders only
};

type Col = { header: string; type?: "text" | "money" | "date" | "int"; width?: number };
type Cell = string | number | Date | null;

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const num = (v: Prisma.Decimal | Decimal | string | null | undefined) => (v == null ? null : Number(v.toString()));

function orderWhere(s: ReportScope): Prisma.OrderWhereInput {
  return {
    tenantId: s.tenantId,
    ...(s.entityId ? { entityId: s.entityId } : {}),
    ...(s.salespersonScope ? { salespersonId: s.salespersonScope } : {}),
  };
}

/** One sheet in the §11.14 house format. */
export function buildSheet(wb: ExcelJS.Workbook, name: string, cols: Col[], rows: Cell[][]) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = cols.map((c) => ({
    header: c.header,
    width: c.width ?? (c.type === "money" ? 14 : c.type === "date" ? 13 : c.type === "int" ? 8 : 22),
    style: c.type === "money" ? { numFmt: MONEY_FMT } : c.type === "date" ? { numFmt: DATE_FMT } : {},
  }));
  for (const r of rows) ws.addRow(r);
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  return ws;
}

// ───────── 1. Sales register (orders with lines) ─────────
async function salesRegister(s: ReportScope) {
  const orders = await prisma.order.findMany({
    where: { ...orderWhere(s), orderDate: { gte: d(s.from), lte: d(s.to) } },
    orderBy: [{ orderDate: "asc" }, { number: "asc" }],
    include: {
      entity: { select: { code: true } },
      customer: { select: { name: true, businessName: true, phoneE164: true, city: true } },
      salesperson: { select: { name: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  const rows: Cell[][] = [];
  for (const o of orders) {
    for (const l of o.lines) {
      rows.push([
        o.orderDate, o.number, o.entity.code, o.customer.businessName ?? o.customer.name, o.customer.phoneE164, o.customer.city,
        o.salesperson.name, o.status, l.description, l.qty, num(l.unitPrice), num(l.lineTotal), num(o.total), num(o.balanceDue),
      ]);
    }
  }
  return {
    sheet: "Sales register",
    cols: [
      { header: "Order date", type: "date" }, { header: "Order no.", width: 16 }, { header: "Entity", width: 8 }, { header: "Customer", width: 28 },
      { header: "Phone", width: 16 }, { header: "City", width: 14 }, { header: "Salesperson", width: 14 }, { header: "Status", width: 20 },
      { header: "Item", width: 34 }, { header: "Qty", type: "int" }, { header: "Unit price", type: "money" }, { header: "Line total", type: "money" },
      { header: "Order total", type: "money" }, { header: "Balance due", type: "money" },
    ] as Col[],
    rows,
  };
}

// ───────── 2. Collections register ─────────
async function collections(s: ReportScope) {
  const payments = await prisma.payment.findMany({
    where: { tenantId: s.tenantId, paidOn: { gte: d(s.from), lte: d(s.to) }, order: orderWhere(s) },
    orderBy: [{ paidOn: "asc" }, { receiptNo: "asc" }],
    include: { order: { select: { number: true, customer: { select: { name: true, businessName: true } }, salesperson: { select: { name: true } } } } },
  });
  const names = await nameMaps(s.tenantId, payments.flatMap((p) => [p.receivedByUserId, p.verifiedById]), payments.flatMap((p) => [p.receivedIntoAccountId, p.depositedToAccountId]));
  return {
    sheet: "Collections",
    cols: [
      { header: "Paid on", type: "date" }, { header: "Receipt no.", width: 20 }, { header: "Order no.", width: 16 }, { header: "Customer", width: 28 },
      { header: "Salesperson", width: 14 }, { header: "Type", width: 10 }, { header: "Method", width: 14 }, { header: "Amount", type: "money" },
      { header: "Status", width: 22 }, { header: "Received into", width: 24 }, { header: "Reference", width: 18 }, { header: "Verified by", width: 14 },
      { header: "Verified on", type: "date" }, { header: "Reject reason", width: 24 },
    ] as Col[],
    rows: payments.map((p) => [
      p.paidOn, p.receiptNo, p.order.number, p.order.customer.businessName ?? p.order.customer.name, p.order.salesperson.name, p.type, p.method,
      p.type === "REFUND" ? -Number(p.amount.toString()) : Number(p.amount.toString()), p.status,
      p.receivedIntoAccountId ? names.accounts.get(p.receivedIntoAccountId) ?? "" : `${names.users.get(p.receivedByUserId ?? "") ?? ""} (personal)`,
      p.referenceNo, p.verifiedById ? names.users.get(p.verifiedById) ?? "" : null, p.verifiedAt ? d(istDateString(p.verifiedAt)) : null, p.rejectReason,
    ]),
  };
}

// ───────── 3. Outstanding by customer with aging (as of today) ─────────
async function outstanding(s: ReportScope, now: Date) {
  const today = istDateString(now);
  const grace = (await prisma.tenantSettings.findUnique({ where: { tenantId: s.tenantId }, select: { overdueGraceDays: true } }))?.overdueGraceDays ?? 7;
  const orders = await prisma.order.findMany({
    where: { ...orderWhere(s), status: { not: "CANCELLED" }, balanceDue: { gt: 0 } },
    select: {
      balanceDue: true, promisedPaymentDate: true, customerId: true,
      customer: { select: { name: true, businessName: true, phoneE164: true, city: true } },
      events: { where: { toStatus: "DELIVERED" }, orderBy: { at: "asc" }, take: 1, select: { at: true } },
    },
  });
  type Agg = { name: string; phone: string; city: string | null; orders: number; total: Decimal; overdue: Decimal; buckets: Decimal[]; maxDays: number };
  const by = new Map<string, Agg>();
  for (const o of orders) {
    const a = by.get(o.customerId) ?? { name: o.customer.businessName ?? o.customer.name, phone: o.customer.phoneE164, city: o.customer.city, orders: 0, total: new Decimal(0), overdue: new Decimal(0), buckets: AGING_BUCKETS.map(() => new Decimal(0)), maxDays: 0 };
    const info = overdueInfo(
      { balanceDue: o.balanceDue.toString(), promisedPaymentDate: o.promisedPaymentDate?.toISOString().slice(0, 10) ?? null, deliveredOn: o.events[0] ? istDateString(o.events[0].at) : null },
      today, grace,
    );
    a.orders += 1;
    a.total = a.total.plus(o.balanceDue.toString());
    if (info.overdue) {
      a.overdue = a.overdue.plus(o.balanceDue.toString());
      const i = AGING_BUCKETS.indexOf(agingBucket(info.daysOverdue));
      a.buckets[i] = a.buckets[i]!.plus(o.balanceDue.toString());
      a.maxDays = Math.max(a.maxDays, info.daysOverdue);
    }
    by.set(o.customerId, a);
  }
  const rows = [...by.values()].sort((x, y) => y.overdue.comparedTo(x.overdue) || y.total.comparedTo(x.total));
  return {
    sheet: "Outstanding",
    cols: [
      { header: "Customer", width: 28 }, { header: "Phone", width: 16 }, { header: "City", width: 14 }, { header: "Open orders", type: "int", width: 11 },
      { header: "Outstanding", type: "money" }, { header: "Overdue", type: "money" }, { header: "0–15 days", type: "money" }, { header: "16–30 days", type: "money" },
      { header: "31–60 days", type: "money" }, { header: "60+ days", type: "money" }, { header: "Max days overdue", type: "int", width: 16 },
    ] as Col[],
    rows: rows.map((a) => [a.name, a.phone, a.city, a.orders, num(a.total), num(a.overdue), ...a.buckets.map((b) => num(b)), a.maxDays]),
  };
}

// ───────── 4. Salesperson performance ─────────
async function performance(s: ReportScope) {
  let rows = await salesLeaderboard({ tenantId: s.tenantId, entityId: s.entityId }, { from: s.from, to: s.to });
  if (s.salespersonScope) rows = rows.filter((r) => r.userId === s.salespersonScope);
  return {
    sheet: "Salesperson performance",
    cols: [
      { header: "Salesperson", width: 18 }, { header: "Booked", type: "money" }, { header: "Target", type: "money" }, { header: "% of target", type: "int", width: 12 },
      { header: "Orders", type: "int" }, { header: "Avg order", type: "money" }, { header: "Collected (verified)", type: "money", width: 20 },
    ] as Col[],
    rows: rows.map((r) => [r.name, num(r.booked), num(r.target), r.pct, r.orders, num(r.avgOrder), num(r.collected)]),
  };
}

// ───────── 5. Cash with staff / deposit register ─────────
async function cashRegister(s: ReportScope, now: Date) {
  const payments = await prisma.payment.findMany({
    where: { tenantId: s.tenantId, receivedByUserId: { not: null }, type: { not: "REFUND" }, paidOn: { gte: d(s.from), lte: d(s.to) }, order: orderWhere(s) },
    orderBy: [{ paidOn: "asc" }, { receiptNo: "asc" }],
    include: { order: { select: { number: true, customer: { select: { name: true, businessName: true } } } } },
  });
  const names = await nameMaps(s.tenantId, payments.map((p) => p.receivedByUserId), payments.map((p) => p.depositedToAccountId));
  const today = d(istDateString(now));
  return {
    sheet: "Cash with staff",
    cols: [
      { header: "Paid on", type: "date" }, { header: "Receipt no.", width: 20 }, { header: "Held by", width: 14 }, { header: "Order no.", width: 16 },
      { header: "Customer", width: 28 }, { header: "Method", width: 10 }, { header: "Amount", type: "money" }, { header: "Status", width: 22 },
      { header: "Deposited to", width: 22 }, { header: "Deposited on", type: "date" }, { header: "Days held", type: "int", width: 10 },
    ] as Col[],
    rows: payments.map((p) => [
      p.paidOn, p.receiptNo, names.users.get(p.receivedByUserId!) ?? "", p.order.number, p.order.customer.businessName ?? p.order.customer.name, p.method,
      Number(p.amount.toString()), p.status, p.depositedToAccountId ? names.accounts.get(p.depositedToAccountId) ?? "" : "With staff",
      p.depositedOn, Math.round(((p.depositedOn ?? today).getTime() - p.paidOn.getTime()) / 86_400_000),
    ]),
  };
}

// ───────── 6. Cancellations with reasons ─────────
async function cancellationsReport(s: ReportScope) {
  const events = await prisma.orderEvent.findMany({
    where: { type: "STATUS_CHANGE", toStatus: "CANCELLED", at: { gte: d(s.from), lt: new Date(d(s.to).getTime() + 86_400_000) }, order: orderWhere(s) },
    orderBy: { at: "asc" },
    include: {
      order: {
        select: {
          id: true, number: true, orderDate: true, total: true, balanceDue: true, cancelReason: true, cancelNote: true,
          customer: { select: { name: true, businessName: true } }, salesperson: { select: { name: true } },
        },
      },
    },
  });
  const seen = new Set<string>();
  const rows: Cell[][] = [];
  for (const e of events) {
    if (seen.has(e.order.id)) continue;
    seen.add(e.order.id);
    const bal = Number(e.order.balanceDue.toString());
    rows.push([
      d(istDateString(e.at)), e.order.number, e.order.orderDate, e.order.customer.businessName ?? e.order.customer.name, e.order.salesperson.name,
      Number(e.order.total.toString()), e.order.cancelReason ?? "", e.order.cancelNote ?? e.note ?? "", bal < 0 ? -bal : 0,
    ]);
  }
  return {
    sheet: "Cancellations",
    cols: [
      { header: "Cancelled on", type: "date" }, { header: "Order no.", width: 16 }, { header: "Order date", type: "date" }, { header: "Customer", width: 28 },
      { header: "Salesperson", width: 14 }, { header: "Order total", type: "money" }, { header: "Reason", width: 22 }, { header: "Note", width: 30 },
      { header: "Refund still due", type: "money", width: 16 },
    ] as Col[],
    rows,
  };
}

// ───────── 7. Product sales ─────────
async function productSales(s: ReportScope) {
  const all = await topProducts({ tenantId: s.tenantId, entityId: s.entityId }, { from: s.from, to: s.to }, 10_000);
  let rows = all.byValue;
  if (s.salespersonScope) {
    // Sales: recompute from own orders only.
    const lines = await prisma.orderLine.findMany({
      where: { order: { ...orderWhere(s), status: { not: "CANCELLED" }, orderDate: { gte: d(s.from), lte: d(s.to) } } },
      select: { productId: true, description: true, qty: true, lineTotal: true, product: { select: { name: true } } },
    });
    const m = new Map<string, { key: string; name: string; qty: number; value: Decimal }>();
    for (const l of lines) {
      const key = l.productId ?? `custom:${l.description}`;
      const cur = m.get(key) ?? { key, name: l.product?.name ?? l.description, qty: 0, value: new Decimal(0) };
      cur.qty += l.qty;
      cur.value = cur.value.plus(l.lineTotal.toString());
      m.set(key, cur);
    }
    rows = [...m.values()].map((x) => ({ ...x, value: x.value.toString() })).sort((a, b) => Number(b.value) - Number(a.value));
  }
  return {
    sheet: "Product sales",
    cols: [{ header: "Product", width: 36 }, { header: "Qty", type: "int" }, { header: "Value", type: "money", width: 16 }] as Col[],
    rows: rows.map((r) => [r.name, r.qty, Number(r.value)]),
  };
}

async function nameMaps(tenantId: string, userIds: (string | null)[], accountIds: (string | null)[]) {
  const u = [...new Set(userIds.filter((x): x is string => Boolean(x)))];
  const a = [...new Set(accountIds.filter((x): x is string => Boolean(x)))];
  const [users, accounts] = await Promise.all([
    prisma.user.findMany({ where: { tenantId, id: { in: u } }, select: { id: true, name: true } }),
    prisma.account.findMany({ where: { tenantId, id: { in: a } }, select: { id: true, label: true } }),
  ]);
  return { users: new Map(users.map((x) => [x.id, x.name])), accounts: new Map(accounts.map((x) => [x.id, x.label])) };
}

/** Builds one report as an .xlsx buffer. */
export async function buildReport(kind: ReportKind, s: ReportScope, now = new Date()): Promise<Buffer> {
  const spec =
    kind === "sales-register" ? await salesRegister(s)
    : kind === "collections" ? await collections(s)
    : kind === "outstanding" ? await outstanding(s, now)
    : kind === "salesperson-performance" ? await performance(s)
    : kind === "cash-with-staff" ? await cashRegister(s, now)
    : kind === "cancellations" ? await cancellationsReport(s)
    : await productSales(s);
  const wb = new ExcelJS.Workbook();
  wb.creator = "SalesOS";
  wb.created = now;
  buildSheet(wb, spec.sheet, spec.cols, spec.rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
