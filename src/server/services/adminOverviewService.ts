// v1.1 §5.2 — Admin Overview metrics (extended per the I1 "Improved admin
// overview" mockup: today ticker, vs-prev-month deltas, pace line, biggest
// balances, last-order-per-employee chip).
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { achievedPct } from "@/server/domain/v1_1/achieved";
import { istYearMonth } from "@/server/domain/fy";
import { istDateString } from "@/server/domain/payment/record";

export type EmployeeTargetRow = {
  userId: string;
  name: string;
  achieved: string;
  target: string;
  pct: number | null; // null = no target
  lastOrderAgo: string | null; // "7 min ago", "today", "yesterday", "4 days", null if never
};

export type LatestOrderRow = {
  id: string;
  serialNo: number | null;
  orderDate: Date;
  createdAt: Date;
  salespersonName: string;
  customerName: string;
  productText: string | null;
  total: string;
  balanceDue: string;
  simpleStatus: "PENDING" | "COMPLETED" | "CANCELLED";
};

export type BalanceRow = {
  orderId: string;
  customerName: string;
  salespersonName: string;
  customerPhoneE164: string;
  pendingDays: number;
  balance: string;
};

export type TodayStrip = {
  orders: number;
  booked: string;
  received: string;
  lastOrderAgo: string | null;
  lastOrderBy: string | null;
};

export type TileWithDelta = {
  count?: number; // optional for money-only tile
  value: string;
  vsPrevPct: number | null; // vs same day in previous month; null if no data
  extraHint?: string; // e.g. "6 pending over 15 days"
};

export type AdminOverview = {
  monthLabel: string; // "October"
  monthYm: string; // "2026-10"
  paceToday: number; // 0..100 – expected % of month complete
  today: TodayStrip;
  ordersCompleted: TileWithDelta;
  paymentReceived: TileWithDelta;
  pendingOrders: TileWithDelta;
  employees: EmployeeTargetRow[];
  biggestBalances: BalanceRow[];
  latestOrders: LatestOrderRow[];
};

// ─── Date helpers ───────────────────────────────────────────────────

function istMonthBounds(d: Date): { start: Date; end: Date } {
  const { year, month } = istYearMonth(d);
  const start = new Date(Date.UTC(year, month - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const end = new Date(Date.UTC(next.y, next.m - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  return { start, end };
}

function istDayBounds(d: Date): { start: Date; end: Date } {
  // IST day = UTC day shifted by +5:30
  const istMillis = d.getTime() + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMillis);
  const istYear = istDate.getUTCFullYear();
  const istMonth = istDate.getUTCMonth();
  const istDay = istDate.getUTCDate();
  const start = new Date(Date.UTC(istYear, istMonth, istDay) - (5 * 60 + 30) * 60 * 1000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function monthLongLabel(now: Date): string {
  return new Date(now).toLocaleDateString("en-IN", {
    month: "long",
    timeZone: "Asia/Kolkata",
  });
}

function istDayOfMonth(d: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" })
      .format(d),
  );
}

function istDaysInMonth(d: Date): number {
  const { year, month } = istYearMonth(d);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function timeAgo(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function lastOrderAgo(then: Date | null, now: Date): string | null {
  if (!then) return null;
  const ms = now.getTime() - then.getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `last order ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `last order ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 0) return "last order today";
  if (days === 1) return "last order yesterday";
  if (days < 7) return `no order in ${days} days`;
  return `no order in ${days} days`;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

function pctChange(current: string | number, prev: string | number): number | null {
  const c = new Decimal(current);
  const p = new Decimal(prev);
  if (p.isZero()) return c.isZero() ? 0 : null;
  return c.minus(p).div(p).times(100).toDecimalPlaces(0).toNumber();
}

// ─── Main query ─────────────────────────────────────────────────────

export async function adminOverview(opts: {
  tenantId: string;
  now?: Date;
}): Promise<AdminOverview> {
  const now = opts.now ?? new Date();
  const { year, month } = istYearMonth(now);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const { start, end } = istMonthBounds(now);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const { start: todayStart, end: todayEnd } = istDayBounds(now);

  // Previous month, same day — for vs-prev-month deltas.
  const prevMonthDate = new Date(Date.UTC(year, month - 2, 15));
  const { start: prevStart } = istMonthBounds(prevMonthDate);
  const prevSameDayEnd = (() => {
    const dom = istDayOfMonth(now);
    const prevDim = istDaysInMonth(prevMonthDate);
    const effectiveDay = Math.min(dom + 1, prevDim + 1);
    const { year: py, month: pm } = istYearMonth(prevMonthDate);
    return new Date(Date.UTC(py, pm - 1, effectiveDay) - (5 * 60 + 30) * 60 * 1000);
  })();

  const scope: Prisma.OrderWhereInput = { tenantId: opts.tenantId };

  // ── Today strip ──
  const todayOrdersPromise = prisma.order.findMany({
    where: { ...scope, createdAt: { gte: todayStart, lt: todayEnd }, simpleStatus: { not: "CANCELLED" } },
    select: { total: true },
  });
  const todayPaymentsPromise = prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(p.amount), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${opts.tenantId}
      AND p.status <> 'REJECTED'
      AND p."paidOn" >= ${istDateString(todayStart)}::date
      AND p."paidOn" < ${istDateString(todayEnd)}::date
      AND o."simpleStatus" <> 'CANCELLED'
  `;
  const todayLastPromise = prisma.order.findFirst({
    where: scope,
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, salesperson: { select: { name: true } } },
  });

  // ── This month ──
  const completedPromise = prisma.order.findMany({
    where: { ...scope, simpleStatus: "COMPLETED", completedAt: { gte: start, lt: end } },
    select: { total: true },
  });
  const paymentsThisMonthPromise = prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(p.amount), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${opts.tenantId}
      AND p.status <> 'REJECTED'
      AND p."paidOn" >= ${istDateString(start)}::date AND p."paidOn" < ${istDateString(end)}::date
      AND o."simpleStatus" <> 'CANCELLED'
  `;
  const pendingPromise = prisma.order.findMany({
    where: { ...scope, simpleStatus: "PENDING" },
    select: { balanceDue: true, orderDate: true, createdAt: true },
  });

  // ── Previous month, same day cumulative (for delta) ──
  const prevCompletedPromise = prisma.order.aggregate({
    where: {
      ...scope,
      simpleStatus: "COMPLETED",
      completedAt: { gte: prevStart, lt: prevSameDayEnd },
    },
    _sum: { total: true },
    _count: true,
  });
  const prevPaymentsPromise = prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(p.amount), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${opts.tenantId}
      AND p.status <> 'REJECTED'
      AND p."paidOn" >= ${istDateString(prevStart)}::date AND p."paidOn" < ${istDateString(prevSameDayEnd)}::date
      AND o."simpleStatus" <> 'CANCELLED'
  `;

  // ── Target progress inputs ──
  const usersPromise = prisma.user.findMany({
    where: { tenantId: opts.tenantId, role: "SALES", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const bookedRowsPromise = prisma.order.groupBy({
    by: ["salespersonId"],
    where: { ...scope, simpleStatus: { not: "CANCELLED" }, orderDate: { gte: start, lt: end } },
    _sum: { total: true },
  });
  const settingsPromise = prisma.tenantSettings.findUnique({
    where: { tenantId: opts.tenantId },
    select: { defaultMonthlyTarget: true },
  });
  const targetRowsPromise = prisma.salesTarget.findMany({
    where: { tenantId: opts.tenantId, month: monthStart },
    select: { userId: true, amount: true },
  });
  const lastOrderPerEmpPromise = prisma.$queryRaw<
    { salespersonId: string; last: Date }[]
  >`
    SELECT "salespersonId", MAX("createdAt") AS last
    FROM "Order"
    WHERE "tenantId" = ${opts.tenantId}
    GROUP BY 1
  `;

  // ── Biggest balances to collect (top 5 by pending days * balance desc) ──
  const biggestBalancesPromise = prisma.order.findMany({
    where: { ...scope, simpleStatus: "PENDING", balanceDue: { gt: 0 } },
    orderBy: [{ orderDate: "asc" }, { balanceDue: "desc" }],
    take: 10,
    select: {
      id: true,
      orderDate: true,
      balanceDue: true,
      salesperson: { select: { name: true } },
      customer: { select: { name: true, phoneE164: true } },
    },
  });

  // ── Latest 8 orders ──
  const latestPromise = prisma.order.findMany({
    where: scope,
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      serialNo: true,
      orderDate: true,
      createdAt: true,
      productText: true,
      total: true,
      balanceDue: true,
      simpleStatus: true,
      salesperson: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });

  const [
    todayOrders,
    todayPayments,
    todayLast,
    completed,
    paymentsThisMonth,
    pending,
    prevCompleted,
    prevPayments,
    users,
    bookedRows,
    settings,
    targetRows,
    lastOrderPerEmp,
    biggestRaw,
    latestRaw,
  ] = await Promise.all([
    todayOrdersPromise,
    todayPaymentsPromise,
    todayLastPromise,
    completedPromise,
    paymentsThisMonthPromise,
    pendingPromise,
    prevCompletedPromise,
    prevPaymentsPromise,
    usersPromise,
    bookedRowsPromise,
    settingsPromise,
    targetRowsPromise,
    lastOrderPerEmpPromise,
    biggestBalancesPromise,
    latestPromise,
  ]);

  // ── Tiles ──
  const completedCount = completed.length;
  const completedValue = completed
    .reduce((s, o) => s.plus(o.total.toString()), new Decimal(0))
    .toString();
  const paymentReceived = paymentsThisMonth[0]?.s.toString() ?? "0";
  const pendingBalance = pending
    .reduce((s, o) => s.plus(o.balanceDue.toString()), new Decimal(0))
    .toString();
  const pendingOverN = pending.filter((o) => daysBetween(o.orderDate, now) >= 15).length;

  const prevCompletedValue = prevCompleted._sum.total?.toString() ?? "0";
  const prevCompletedCount = prevCompleted._count ?? 0;
  const prevPaymentReceived = prevPayments[0]?.s.toString() ?? "0";

  // ── Today strip ──
  const todayStrip: TodayStrip = {
    orders: todayOrders.length,
    booked: todayOrders.reduce((s, o) => s.plus(o.total.toString()), new Decimal(0)).toString(),
    received: todayPayments[0]?.s.toString() ?? "0",
    lastOrderAgo: todayLast ? timeAgo(todayLast.createdAt, now) : null,
    lastOrderBy: todayLast?.salesperson.name ?? null,
  };

  // ── Target progress ──
  const bookedBy = new Map(
    bookedRows.map((r) => [r.salespersonId, r._sum.total?.toString() ?? "0"]),
  );
  const targetBy = new Map(
    targetRows.map((r) => [r.userId, r.amount.toString()]),
  );
  const lastByEmp = new Map(lastOrderPerEmp.map((r) => [r.salespersonId, r.last]));
  const defaultTarget = settings?.defaultMonthlyTarget.toString() ?? "0";

  const employees: EmployeeTargetRow[] = users
    .map((u) => {
      const achieved = bookedBy.get(u.id) ?? "0";
      const target = targetBy.get(u.id) ?? defaultTarget;
      return {
        userId: u.id,
        name: u.name,
        achieved,
        target,
        pct: achievedPct(achieved, target),
        lastOrderAgo: lastOrderAgo(lastByEmp.get(u.id) ?? null, now),
      };
    })
    .sort((a, b) => {
      if (a.pct === null && b.pct === null) return a.name.localeCompare(b.name);
      if (a.pct === null) return 1;
      if (b.pct === null) return -1;
      return b.pct - a.pct;
    });

  // ── Biggest balances (top 5) ──
  const biggestBalances: BalanceRow[] = biggestRaw.slice(0, 5).map((o) => ({
    orderId: o.id,
    customerName: o.customer.name,
    salespersonName: o.salesperson.name,
    customerPhoneE164: o.customer.phoneE164,
    pendingDays: daysBetween(o.orderDate, now),
    balance: o.balanceDue.toString(),
  }));

  // ── Latest orders ──
  const latestOrders: LatestOrderRow[] = latestRaw.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    orderDate: r.orderDate,
    createdAt: r.createdAt,
    salespersonName: r.salesperson.name,
    customerName: r.customer.name,
    productText: r.productText,
    total: r.total.toString(),
    balanceDue: r.balanceDue.toString(),
    simpleStatus: r.simpleStatus,
  }));

  // ── Pace line ──
  const paceToday = Math.round((istDayOfMonth(now) / istDaysInMonth(now)) * 100);

  return {
    monthLabel: monthLongLabel(now),
    monthYm: ym,
    paceToday,
    today: todayStrip,
    ordersCompleted: {
      count: completedCount,
      value: completedValue,
      vsPrevPct: pctChange(completedCount, prevCompletedCount),
      extraHint: undefined,
    },
    paymentReceived: {
      value: paymentReceived,
      vsPrevPct: pctChange(paymentReceived, prevPaymentReceived),
      extraHint: undefined,
    },
    pendingOrders: {
      count: pending.length,
      value: pendingBalance,
      vsPrevPct: null,
      extraHint: pendingOverN > 0 ? `${pendingOverN} pending over 15 days` : undefined,
    },
    employees,
    biggestBalances,
    latestOrders,
  };
}
