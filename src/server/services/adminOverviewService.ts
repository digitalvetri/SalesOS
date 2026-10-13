// v1.1 §5.2 — Admin Overview metrics (extended per the I1 "Improved admin
// overview" mockup: today ticker, vs-prev-month deltas, pace line, biggest
// balances, last-order-per-employee chip).
//
// Metric definitions (all business dates are IST calendar dates):
// - Orders are bucketed by `orderDate` (the real order date), never
//   `createdAt` (entry/import time). Cancelled orders never count.
// - Payment received = Σ payments with `paidOn` in the window, status not
//   REJECTED, refunds subtracted, on non-cancelled orders.
// - Orders completed this month = simpleStatus COMPLETED with `completedAt`
//   in the month (the importer sets completedAt = orderDate for sheet orders).
// - Still to collect = Σ balanceDue > 0 over every non-cancelled order
//   (pending AND completed-but-unpaid), excluding sheet rows with no amount.
// - Deltas compare the month so far with the previous month up to the same
//   day; no comparison when the previous figure is 0.
import { prisma, type Prisma } from "@/server/repo/client";
import { achievedPct } from "@/server/domain/v1_1/achieved";
import {
  dateOnly,
  daysSince,
  deltaPct,
  displayCustomerName,
  hasTarget,
  lastOrderChip,
  monthWindow,
  orderDayLabel,
  paceToday as paceTodayOf,
  sortTargetRows,
  teamTotals,
  ymdOf,
  type TeamTotals,
} from "@/server/domain/dashboard/overview";

export const PENDING_ALERT_DAYS = 15;

export type EmployeeTargetRow = {
  userId: string;
  name: string;
  achieved: string; // booked this month (orderDate in month, non-cancelled)
  target: string; // "0" when no target is set
  hasTarget: boolean;
  pct: number | null; // null = no target
  lastOrderAgo: string | null; // "last order today", "no order in 4 days", null if never
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
  totalMissing: boolean;
  balanceDue: string;
  simpleStatus: "PENDING" | "COMPLETED" | "CANCELLED";
};

export type BalanceRow = {
  orderId: string;
  customerName: string;
  salespersonName: string;
  customerPhoneE164: string | null; // null = no phone on file → no Remind button
  pendingDays: number; // IST days since the order date
  simpleStatus: "PENDING" | "COMPLETED";
  balance: string;
};

export type TodayStrip = {
  orders: number; // orders dated today (IST), non-cancelled
  booked: string;
  received: string; // payments dated today
  lastOrderAgo: string | null; // "today" / "yesterday" / "3 days ago" / "12 Sep" — by order date
  lastOrderBy: string | null;
};

export type TileWithDelta = {
  count?: number; // optional for money-only tile
  value: string;
  vsPrevPct: number | null; // vs same day in previous month; null = no comparison
  extraHint?: string; // e.g. "6 pending over 15 days"
};

export type AdminOverview = {
  monthLabel: string; // "October"
  monthYm: string; // "2026-10"
  prevMonthYm: string; // "2026-09"
  paceToday: number; // 0..100 – expected % of month complete
  today: TodayStrip;
  ordersCompleted: TileWithDelta;
  paymentReceived: TileWithDelta;
  pendingOrders: TileWithDelta & { collectCount: number };
  employees: EmployeeTargetRow[];
  team: TeamTotals;
  biggestBalances: BalanceRow[];
  latestOrders: LatestOrderRow[];
};

function monthLongLabel(ym: string): string {
  return dateOnly(`${ym}-01`).toLocaleDateString("en-IN", { month: "long", timeZone: "UTC" });
}

/** Net money received on non-cancelled orders with paidOn in [from, to). Refunds subtract. */
function paymentsBetween(tenantId: string, from: string, to: string) {
  return prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(CASE WHEN p.type = 'REFUND' THEN -p.amount ELSE p.amount END), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${tenantId}
      AND p.status <> 'REJECTED'
      AND p."paidOn" >= ${from}::date AND p."paidOn" < ${to}::date
      AND o."simpleStatus" <> 'CANCELLED'
  `;
}

// ─── Latest orders (also polled by /api/overview/latest-orders) ─────

/** Most recent orders by order date (tie-break: most recently entered). */
export async function latestOrders(opts: { tenantId: string; take?: number }): Promise<LatestOrderRow[]> {
  const rows = await prisma.order.findMany({
    where: { tenantId: opts.tenantId },
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 8,
    select: {
      id: true,
      serialNo: true,
      orderDate: true,
      createdAt: true,
      productText: true,
      total: true,
      totalMissing: true,
      balanceDue: true,
      simpleStatus: true,
      sheetRow: true,
      salesperson: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    orderDate: r.orderDate,
    createdAt: r.createdAt,
    salespersonName: r.salesperson.name,
    customerName: displayCustomerName(r.sheetRow, r.customer.name),
    productText: r.productText,
    total: r.total.toString(),
    totalMissing: r.totalMissing,
    balanceDue: r.balanceDue.toString(),
    simpleStatus: r.simpleStatus,
  }));
}

// ─── Main query ─────────────────────────────────────────────────────

export async function adminOverview(opts: {
  tenantId: string;
  now?: Date;
}): Promise<AdminOverview> {
  const now = opts.now ?? new Date();
  const w = monthWindow(now);
  const today = dateOnly(w.today);
  const monthRange = { gte: dateOnly(w.monthStart), lt: dateOnly(w.nextMonthStart) };
  const prevRange = { gte: dateOnly(w.prevStart), lt: dateOnly(w.prevSameDayEnd) };

  const scope: Prisma.OrderWhereInput = { tenantId: opts.tenantId };
  const live: Prisma.OrderWhereInput = { ...scope, simpleStatus: { not: "CANCELLED" } };

  // ── Today strip ──
  const todayOrdersPromise = prisma.order.aggregate({
    where: { ...live, orderDate: today },
    _sum: { total: true },
    _count: true,
  });
  const todayPaymentsPromise = paymentsBetween(opts.tenantId, w.today, ymdOf(new Date(today.getTime() + 86_400_000)));
  const lastOrderPromise = prisma.order.findFirst({
    where: live,
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    select: { orderDate: true, salesperson: { select: { name: true } } },
  });

  // ── This month ──
  const completedPromise = prisma.order.aggregate({
    where: { ...scope, simpleStatus: "COMPLETED", completedAt: monthRange },
    _sum: { total: true },
    _count: true,
  });
  const paymentsThisMonthPromise = paymentsBetween(opts.tenantId, w.monthStart, w.nextMonthStart);
  const pendingPromise = prisma.order.findMany({
    where: { ...scope, simpleStatus: "PENDING" },
    select: { orderDate: true },
  });
  const toCollectPromise = prisma.order.aggregate({
    where: { ...live, balanceDue: { gt: 0 }, totalMissing: false },
    _sum: { balanceDue: true },
    _count: true,
  });

  // ── Previous month up to the same day (for deltas) ──
  const prevCompletedPromise = prisma.order.aggregate({
    where: { ...scope, simpleStatus: "COMPLETED", completedAt: prevRange },
    _count: true,
  });
  const prevPaymentsPromise = paymentsBetween(opts.tenantId, w.prevStart, w.prevSameDayEnd);

  // ── Target progress inputs ──
  const usersPromise = prisma.user.findMany({
    where: { tenantId: opts.tenantId, role: "SALES", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const bookedRowsPromise = prisma.order.groupBy({
    by: ["salespersonId"],
    where: { ...live, orderDate: monthRange },
    _sum: { total: true },
  });
  const settingsPromise = prisma.tenantSettings.findUnique({
    where: { tenantId: opts.tenantId },
    select: { defaultMonthlyTarget: true },
  });
  const targetRowsPromise = prisma.salesTarget.findMany({
    where: { tenantId: opts.tenantId, month: dateOnly(w.monthStart) },
    select: { userId: true, amount: true },
  });
  const lastOrderPerEmpPromise = prisma.order.groupBy({
    by: ["salespersonId"],
    where: live,
    _max: { orderDate: true },
  });

  // ── Biggest balances to collect: largest balance first, oldest order breaks ties ──
  const biggestBalancesPromise = prisma.order.findMany({
    where: { ...live, balanceDue: { gt: 0 }, totalMissing: false },
    orderBy: [{ balanceDue: "desc" }, { orderDate: "asc" }],
    take: 5,
    select: {
      id: true,
      orderDate: true,
      balanceDue: true,
      simpleStatus: true,
      sheetRow: true,
      salesperson: { select: { name: true } },
      customer: { select: { name: true, phoneE164: true } },
    },
  });

  const [
    todayOrders,
    todayPayments,
    lastOrder,
    completed,
    paymentsThisMonth,
    pending,
    toCollect,
    prevCompleted,
    prevPayments,
    users,
    bookedRows,
    settings,
    targetRows,
    lastOrderPerEmp,
    biggestRaw,
    latest,
  ] = await Promise.all([
    todayOrdersPromise,
    todayPaymentsPromise,
    lastOrderPromise,
    completedPromise,
    paymentsThisMonthPromise,
    pendingPromise,
    toCollectPromise,
    prevCompletedPromise,
    prevPaymentsPromise,
    usersPromise,
    bookedRowsPromise,
    settingsPromise,
    targetRowsPromise,
    lastOrderPerEmpPromise,
    biggestBalancesPromise,
    latestOrders({ tenantId: opts.tenantId }),
  ]);

  // ── Tiles ──
  const paymentReceived = paymentsThisMonth[0]?.s.toString() ?? "0";
  const prevPaymentReceived = prevPayments[0]?.s.toString() ?? "0";
  const pendingOverN = pending.filter((o) => daysSince(ymdOf(o.orderDate), w.today) >= PENDING_ALERT_DAYS).length;

  // ── Today strip ──
  const todayStrip: TodayStrip = {
    orders: todayOrders._count,
    booked: todayOrders._sum.total?.toString() ?? "0",
    received: todayPayments[0]?.s.toString() ?? "0",
    lastOrderAgo: lastOrder ? orderDayLabel(ymdOf(lastOrder.orderDate), w.today) : null,
    lastOrderBy: lastOrder?.salesperson.name ?? null,
  };

  // ── Target progress ──
  const bookedBy = new Map(bookedRows.map((r) => [r.salespersonId, r._sum.total?.toString() ?? "0"]));
  const targetBy = new Map(targetRows.map((r) => [r.userId, r.amount.toString()]));
  const lastByEmp = new Map(
    lastOrderPerEmp.map((r) => [r.salespersonId, r._max.orderDate ? ymdOf(r._max.orderDate) : null]),
  );
  const defaultTarget = settings?.defaultMonthlyTarget.toString() ?? "0";

  const employees: EmployeeTargetRow[] = sortTargetRows(
    users.map((u) => {
      const achieved = bookedBy.get(u.id) ?? "0";
      const rawTarget = targetBy.get(u.id) ?? defaultTarget;
      const real = hasTarget(rawTarget);
      return {
        userId: u.id,
        name: u.name,
        achieved,
        target: real ? rawTarget : "0",
        hasTarget: real,
        pct: real ? achievedPct(achieved, rawTarget) : null,
        lastOrderAgo: lastOrderChip(lastByEmp.get(u.id) ?? null, w.today),
      };
    }),
  );

  // ── Biggest balances ──
  const biggestBalances: BalanceRow[] = biggestRaw.map((o) => ({
    orderId: o.id,
    customerName: displayCustomerName(o.sheetRow, o.customer.name),
    salespersonName: o.salesperson.name,
    customerPhoneE164: o.customer.phoneE164 ?? null,
    pendingDays: daysSince(ymdOf(o.orderDate), w.today),
    simpleStatus: o.simpleStatus === "COMPLETED" ? "COMPLETED" : "PENDING",
    balance: o.balanceDue.toString(),
  }));

  return {
    monthLabel: monthLongLabel(w.ym),
    monthYm: w.ym,
    prevMonthYm: w.prevYm,
    paceToday: paceTodayOf(w),
    today: todayStrip,
    ordersCompleted: {
      count: completed._count,
      value: completed._sum.total?.toString() ?? "0",
      vsPrevPct: deltaPct(completed._count, prevCompleted._count),
    },
    paymentReceived: {
      value: paymentReceived,
      vsPrevPct: deltaPct(paymentReceived, prevPaymentReceived),
    },
    pendingOrders: {
      count: pending.length,
      value: toCollect._sum.balanceDue?.toString() ?? "0",
      collectCount: toCollect._count,
      vsPrevPct: null,
      extraHint:
        pendingOverN > 0
          ? `${pendingOverN} pending over ${PENDING_ALERT_DAYS} days`
          : undefined,
    },
    employees,
    team: teamTotals(employees),
    biggestBalances,
    latestOrders: latest,
  };
}
