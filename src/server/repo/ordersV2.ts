// v1.1 listing — the sheet view (§4.3 / §5.3).
import { prisma, type Prisma, type OrderStatusV2 } from "./client";

export type OrderV2Row = {
  id: string;
  serialNo: number | null;
  number: string;
  orderDate: Date;
  salespersonId: string;
  salespersonName: string;
  productText: string | null;
  customerId: string;
  customerName: string;
  customerPhoneE164: string;
  total: string;
  paidTotal: string;
  balanceDue: string;
  simpleStatus: OrderStatusV2;
  completedAt: Date | null;
  cancelNote: string | null;
};

export type OrderV2Filters = {
  tenantId: string;
  salespersonId?: string; // scope to one salesperson (SALES view)
  month?: string | null; // "2026-10" — null means "all time"
  status?: "all" | "pending" | "completed" | "balance_due";
  search?: string; // searches productText, customer.name, customer.phoneE164
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

export async function listOrdersV2(f: OrderV2Filters): Promise<OrderV2Row[]> {
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
  if (f.search) {
    const q = f.search.trim();
    where.OR = [
      { productText: { contains: q, mode: "insensitive" } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
      { customer: { phoneE164: { contains: q } } },
    ];
  }

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
      simpleStatus: true,
      completedAt: true,
      cancelNote: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    number: r.number,
    orderDate: r.orderDate,
    salespersonId: r.salespersonId,
    salespersonName: r.salesperson.name,
    productText: r.productText,
    customerId: r.customerId,
    customerName: r.customer.name,
    customerPhoneE164: r.customer.phoneE164,
    total: r.total.toString(),
    paidTotal: r.paidTotal.toString(),
    balanceDue: r.balanceDue.toString(),
    simpleStatus: r.simpleStatus,
    completedAt: r.completedAt,
    cancelNote: r.cancelNote,
  }));
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
