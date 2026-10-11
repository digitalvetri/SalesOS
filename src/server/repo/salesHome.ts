// Query helpers for the SALES-role home page (spec §11.2). Scoped to one
// salesperson per call — never used for admin dashboards. The full dashboard
// metric set lives in §9 and ships in P5.
import Decimal from "decimal.js";
import { prisma, type OrderStatus } from "./client";

export type MonthBooked = {
  booked: Decimal;
  ordersCount: number;
  avgOrderValue: Decimal;
};

export type OutstandingSummary = {
  outstanding: Decimal;
  openOrderCount: number;
};

export type RecentOrderRow = {
  id: string;
  number: string;
  customerName: string;
  total: string;
  balanceDue: string;
  status: OrderStatus;
  orderDate: Date;
};

// IST month boundaries. Both dates returned are UTC Date objects.
function istMonthBounds(d: Date): { start: Date; end: Date } {
  // Format into IST YYYY-MM to decide which month we're in.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "numeric",
  }).formatToParts(d);
  const year = Number(fmt.find((p) => p.type === "year")!.value);
  const month = Number(fmt.find((p) => p.type === "month")!.value); // 1..12
  // IST = UTC+5:30 → the IST month starts at (prev day 18:30) UTC on day 1.
  const start = new Date(Date.UTC(year, month - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const end = new Date(Date.UTC(nextMonth.y, nextMonth.m - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  return { start, end };
}

export async function salesMonthBooked(opts: {
  tenantId: string;
  salespersonId: string;
  anchor: Date;
}): Promise<MonthBooked> {
  const { start, end } = istMonthBounds(opts.anchor);
  const rows = await prisma.order.findMany({
    where: {
      tenantId: opts.tenantId,
      salespersonId: opts.salespersonId,
      status: { not: "CANCELLED" },
      orderDate: { gte: start, lt: end },
    },
    select: { total: true },
  });
  const total = rows.reduce((s, r) => s.plus(r.total.toString()), new Decimal(0));
  const avg = rows.length === 0 ? new Decimal(0) : total.div(rows.length);
  return { booked: total, ordersCount: rows.length, avgOrderValue: avg };
}

export async function salesMonthTarget(opts: {
  tenantId: string;
  userId: string;
  anchor: Date;
}): Promise<Decimal | null> {
  const { start } = istMonthBounds(opts.anchor);
  const row = await prisma.salesTarget.findUnique({
    where: {
      tenantId_userId_month: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        month: start,
      },
    },
    select: { amount: true },
  });
  return row ? new Decimal(row.amount.toString()) : null;
}

export async function salesOutstanding(opts: {
  tenantId: string;
  salespersonId: string;
}): Promise<OutstandingSummary> {
  const rows = await prisma.order.findMany({
    where: {
      tenantId: opts.tenantId,
      salespersonId: opts.salespersonId,
      status: { notIn: ["CANCELLED", "CLOSED"] },
      balanceDue: { gt: 0 },
    },
    select: { balanceDue: true },
  });
  const total = rows.reduce((s, r) => s.plus(r.balanceDue.toString()), new Decimal(0));
  return { outstanding: total, openOrderCount: rows.length };
}

export async function salesRecentOrders(opts: {
  tenantId: string;
  salespersonId: string;
  limit?: number;
}): Promise<RecentOrderRow[]> {
  const rows = await prisma.order.findMany({
    where: {
      tenantId: opts.tenantId,
      salespersonId: opts.salespersonId,
    },
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    take: opts.limit ?? 10,
    select: {
      id: true,
      number: true,
      total: true,
      balanceDue: true,
      status: true,
      orderDate: true,
      customer: { select: { name: true, businessName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    customerName: r.customer.businessName ?? r.customer.name,
    total: r.total.toString(),
    balanceDue: r.balanceDue.toString(),
    status: r.status,
    orderDate: r.orderDate,
  }));
}

export async function salesPendingActions(opts: {
  tenantId: string;
  salespersonId: string;
}) {
  // Minimal "needs you" surface for P2. P5 dashboard replaces this with richer tiles.
  const [rejectedPrice, rejectedPayments] = await Promise.all([
    prisma.order.count({
      where: {
        tenantId: opts.tenantId,
        salespersonId: opts.salespersonId,
        status: "CANCELLED",
        cancelReason: "PRICE",
      },
    }),
    prisma.payment.count({
      where: {
        tenantId: opts.tenantId,
        order: { salespersonId: opts.salespersonId },
        status: "REJECTED",
      },
    }),
  ]);
  return { rejectedPrice, rejectedPayments };
}
