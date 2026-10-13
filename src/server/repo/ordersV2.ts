// v1.1 listing — the sheet view (§4.3 / §5.3).
import { prisma, type Prisma, type OrderStatusV2 } from "./client";
import { readSheetRow, type SheetRow } from "@/server/domain/import/sheetRow";
import { realPhone, customerLabelOf, contactLabelOf, telOf } from "@/lib/orderDisplay";

export type OrderV2Row = {
  id: string;
  serialNo: number | null;
  number: string;
  orderDate: Date;
  salespersonId: string;
  salespersonName: string;
  productText: string | null;
  customerId: string;
  customerName: string; // the customer record's name ("" when the sheet had none)
  customerPhoneE164: string | null; // real phone only (placeholders → null)
  /** Per-order display name: sheet CUSTOMER cell for imported orders, else customer.name; "—" if empty. */
  customerLabel: string;
  /** Per-order contact text: sheet CONTACT cell (raw), else the customer phone; "—" if none. */
  contactLabel: string;
  /** tel: target, or null when there is nothing dialable. */
  contactTel: string | null;
  total: string;
  paidTotal: string;
  balanceDue: string;
  /** The sheet's TOTAL cell was empty — show total/paid/balance as "—". */
  totalMissing: boolean;
  accDetails: string | null; // where the payment was received (editable; from ACC DETAILS)
  /** The original sheet row (imported orders only). */
  sheetRow: SheetRow | null;
  promisedDeliveryDate: Date | null;
  notes: string | null;
  simpleStatus: OrderStatusV2;
  completedAt: Date | null;
  cancelNote: string | null;
};

export type OrderV2Filters = {
  tenantId: string;
  salespersonId?: string; // scope to one salesperson (SALES view)
  month?: string | null; // "2026-10" — null means "all time"
  status?: "all" | "pending" | "completed" | "balance_due";
  // Matches productText, notes, customer name/phone, and the sheet's CUSTOMER / CONTACT cells.
  search?: string;
  limit?: number;
};

function monthBounds(ym: string): { start: Date; end: Date } {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  // IST = UTC+5:30 — month boundaries converted.
  const start = new Date(Date.UTC(y, m - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const end = new Date(Date.UTC(next.y, next.m - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  return { start, end };
}

/** Ids of orders whose sheet CUSTOMER / CONTACT cell contains `q` (case-insensitive). */
async function sheetRowMatches(tenantId: string, q: string): Promise<string[]> {
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Order"
    WHERE "tenantId" = ${tenantId}
      AND "sheetRow" IS NOT NULL
      AND ("sheetRow"->>'customer' ILIKE ${like} OR "sheetRow"->>'contact' ILIKE ${like})
    LIMIT 5000
  `;
  return rows.map((r) => r.id);
}

async function buildWhere(f: Omit<OrderV2Filters, "limit">): Promise<Prisma.OrderWhereInput> {
  const where: Prisma.OrderWhereInput = { tenantId: f.tenantId };
  if (f.salespersonId) where.salespersonId = f.salespersonId;
  if (f.month) {
    const b = monthBounds(f.month);
    where.orderDate = { gte: b.start, lt: b.end };
  }
  if (f.status === "pending") where.simpleStatus = "PENDING";
  if (f.status === "completed") where.simpleStatus = "COMPLETED";
  if (f.status === "balance_due") {
    where.balanceDue = { gt: 0 };
    where.simpleStatus = { not: "CANCELLED" };
  }
  const q = f.search?.trim();
  if (q) {
    const sheetIds = await sheetRowMatches(f.tenantId, q);
    where.OR = [
      { productText: { contains: q, mode: "insensitive" } },
      { notes: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { phoneE164: { contains: q } } },
      ...(sheetIds.length > 0 ? [{ id: { in: sheetIds } }] : []),
    ];
  }
  return where;
}

export async function listOrdersV2(f: OrderV2Filters): Promise<OrderV2Row[]> {
  const where = await buildWhere(f);

  const rows = await prisma.order.findMany({
    where,
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    take: f.limit ?? 5000,
    select: {
      id: true,
      serialNo: true,
      number: true,
      orderDate: true,
      salespersonId: true,
      salesperson: { select: { name: true } },
      productText: true,
      customerId: true,
      customer: { select: { name: true, phoneE164: true } },
      total: true,
      paidTotal: true,
      balanceDue: true,
      totalMissing: true,
      accDetails: true,
      sheetRow: true,
      promisedDeliveryDate: true,
      notes: true,
      simpleStatus: true,
      completedAt: true,
      cancelNote: true,
    },
  });

  return rows.map((r) => {
    const sheetRow = readSheetRow(r.sheetRow);
    const phone = realPhone(r.customer.phoneE164);
    return {
      id: r.id,
      serialNo: r.serialNo,
      number: r.number,
      orderDate: r.orderDate,
      salespersonId: r.salespersonId,
      salespersonName: r.salesperson.name,
      productText: r.productText,
      customerId: r.customerId,
      customerName: r.customer.name,
      customerPhoneE164: phone,
      customerLabel: customerLabelOf(sheetRow, r.customer.name),
      contactLabel: contactLabelOf(sheetRow, phone),
      contactTel: telOf(sheetRow, phone),
      total: r.total.toString(),
      paidTotal: r.paidTotal.toString(),
      balanceDue: r.balanceDue.toString(),
      totalMissing: r.totalMissing,
      accDetails: r.accDetails ?? null,
      sheetRow,
      promisedDeliveryDate: r.promisedDeliveryDate,
      notes: r.notes,
      simpleStatus: r.simpleStatus,
      completedAt: r.completedAt,
      cancelNote: r.cancelNote,
    };
  });
}

/**
 * Order counts per salesperson for the same month / status / search filters
 * (used by the admin's employee picker). `all` is the true filtered total.
 */
export async function countOrdersBySalesperson(
  f: Omit<OrderV2Filters, "salespersonId" | "limit">,
): Promise<{ all: number; bySalesperson: Record<string, number> }> {
  const where = await buildWhere(f);
  const groups = await prisma.order.groupBy({
    by: ["salespersonId"],
    where,
    _count: { _all: true },
  });
  const bySalesperson: Record<string, number> = {};
  let all = 0;
  for (const g of groups) {
    bySalesperson[g.salespersonId] = g._count._all;
    all += g._count._all;
  }
  return { all, bySalesperson };
}

/** Months (YYYY-MM) that have at least one order for the scope. Desc. */
export async function listOrderMonths(opts: {
  tenantId: string;
  salespersonId?: string;
}): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ month: string }[]>`
    SELECT DISTINCT to_char("orderDate" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month
    FROM "Order"
    WHERE "tenantId" = ${opts.tenantId}
      AND (${opts.salespersonId ?? null}::text IS NULL OR "salespersonId" = ${opts.salespersonId ?? null})
    ORDER BY month DESC
  `;
  return rows.map((r) => r.month);
}

export async function getOrderV2WithPayments(opts: {
  tenantId: string;
  orderId: string;
}) {
  return prisma.order.findFirst({
    where: { tenantId: opts.tenantId, id: opts.orderId },
    select: {
      id: true,
      serialNo: true,
      number: true,
      productText: true,
      total: true,
      paidTotal: true,
      balanceDue: true,
      simpleStatus: true,
      orderDate: true,
      completedAt: true,
      cancelNote: true,
      totalMissing: true,
      accDetails: true,
      sheetRow: true,
      notes: true,
      promisedDeliveryDate: true,
      salespersonId: true,
      salesperson: { select: { name: true } },
      customer: { select: { id: true, name: true, phoneE164: true } },
      payments: {
        where: { status: { not: "REJECTED" } },
        orderBy: { paidOn: "desc" },
        select: {
          id: true,
          amount: true,
          method: true,
          paidOn: true,
          createdAt: true,
          createdById: true,
          note: true,
        },
      },
    },
  });
}
