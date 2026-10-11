// v1.1 §4.2 — one query per metric for the employee Overview page.
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { achievedPct, amountToReachTarget } from "@/server/domain/v1_1/achieved";
import { istYearMonth } from "@/server/domain/fy";

export type RecentOrderRow = {
  id: string;
  serialNo: number | null;
  orderDate: Date;
  customerName: string;
  productText: string | null;
  total: string;
  balanceDue: string;
  simpleStatus: "PENDING" | "COMPLETED" | "CANCELLED";
};

export type EmployeeOverview = {
  monthLabel: string; // "October"
  monthYm: string; // "2026-10"
  daysLeft: number;
  target: string; // decimal string
  targetSource: "SalesTarget" | "DefaultSetting" | "None";
  achieved: string;
  achievedPct: number | null;
  amountToReachTarget: string;
  counts: { orders: number; completed: number; pending: number };
  paymentReceived: string;
  balanceToCollect: { amount: string; orderCount: number };
  lastSixMonths: Array<{ ym: string; label: string; achieved: string }>;
  recentOrders: RecentOrderRow[];
};

function istMonthBounds(d: Date): { start: Date; end: Date } {
  const { year, month } = istYearMonth(d);
  // IST = UTC+5:30 → month start/end converted to UTC Date.
  const start = new Date(Date.UTC(year, month - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const end = new Date(Date.UTC(next.y, next.m - 1, 1) - (5 * 60 + 30) * 60 * 1000);
  return { start, end };
}

function monthShortLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function monthLongLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    timeZone: "UTC",
  });
}

function daysLeftInMonth(now: Date): number {
  const { year, month } = istYearMonth(now);
  // Day of month in IST
  const todayDay = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric" })
      .format(now),
  );
  // last day = day 0 of next month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.max(0, lastDay - todayDay);
}

export async function employeeOverview(opts: {
  tenantId: string;
  userId: string;
  now?: Date;
}): Promise<EmployeeOverview> {
  const now = opts.now ?? new Date();
  const { year, month } = istYearMonth(now);
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  const { start, end } = istMonthBounds(now);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));

  // Target — spec §2: SalesTarget row, else TenantSettings.defaultMonthlyTarget, else 0.
  const [targetRow, settings] = await Promise.all([
    prisma.salesTarget.findUnique({
      where: {
        tenantId_userId_month: {
          tenantId: opts.tenantId,
          userId: opts.userId,
          month: monthStart,
        },
      },
      select: { amount: true },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId: opts.tenantId },
      select: { defaultMonthlyTarget: true },
    }),
  ]);

  const targetStr =
    targetRow?.amount.toString() ??
    settings?.defaultMonthlyTarget.toString() ??
    "0";
  const targetSource: EmployeeOverview["targetSource"] =
    targetRow ? "SalesTarget"
      : (settings?.defaultMonthlyTarget && !new Decimal(settings.defaultMonthlyTarget.toString()).isZero())
        ? "DefaultSetting"
        : "None";

  // Scoped base — every query filters by (tenantId, salespersonId) on Order.
  const orderScope: Prisma.OrderWhereInput = {
    tenantId: opts.tenantId,
    salespersonId: opts.userId,
  };

  // Achieved (non-cancelled) + counts for this month.
  const monthOrders = await prisma.order.findMany({
    where: {
      ...orderScope,
      orderDate: { gte: start, lt: end },
      simpleStatus: { not: "CANCELLED" },
    },
    select: {
      total: true,
      simpleStatus: true,
      balanceDue: true,
      completedAt: true,
    },
  });
  const achieved = monthOrders.reduce(
    (s, o) => s.plus(o.total.toString()),
    new Decimal(0),
  );
  const counts = {
    orders: monthOrders.length,
    completed: monthOrders.filter((o) => o.simpleStatus === "COMPLETED").length,
    pending: monthOrders.filter((o) => o.simpleStatus === "PENDING").length,
  };

  // Payment received this month — Σ payments by paidOn, scoped to this user's orders.
  const paymentsRow = await prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(p.amount), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${opts.tenantId}
      AND o."salespersonId" = ${opts.userId}
      AND p.status <> 'REJECTED'
      AND p."paidOn" >= ${start}::date
      AND p."paidOn" < ${end}::date
      AND o."simpleStatus" <> 'CANCELLED'
  `;
  const paymentReceived = paymentsRow[0]?.s.toString() ?? "0";

  // Balance to collect = Σ balanceDue across all this user's open orders.
  const openOrders = await prisma.order.findMany({
    where: {
      ...orderScope,
      simpleStatus: { not: "CANCELLED" },
      balanceDue: { gt: 0 },
    },
    select: { balanceDue: true },
  });
  const balanceToCollect = {
    amount: openOrders
      .reduce((s, o) => s.plus(o.balanceDue.toString()), new Decimal(0))
      .toString(),
    orderCount: openOrders.length,
  };

  // Last 6 months (including current) — booked value per month.
  const sixMonths: string[] = [];
  {
    let y = year;
    let m = month;
    for (let i = 0; i < 6; i++) {
      sixMonths.unshift(`${y}-${String(m).padStart(2, "0")}`);
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
  }
  const sixStart = istMonthBounds(
    new Date(Date.UTC(Number(sixMonths[0]!.slice(0, 4)), Number(sixMonths[0]!.slice(5)) - 1, 15)),
  ).start;
  const sixRows = await prisma.$queryRaw<
    { month: string; booked: Prisma.Decimal }[]
  >`
    SELECT to_char("orderDate" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS month,
           COALESCE(SUM(total), 0) AS booked
    FROM "Order"
    WHERE "tenantId" = ${opts.tenantId}
      AND "salespersonId" = ${opts.userId}
      AND "simpleStatus" <> 'CANCELLED'
      AND "orderDate" >= ${sixStart}::date
    GROUP BY 1
  `;
  const byMonth = new Map(sixRows.map((r) => [r.month, r.booked.toString()]));
  const lastSixMonths = sixMonths.map((ym) => ({
    ym,
    label: monthShortLabel(ym),
    achieved: byMonth.get(ym) ?? "0",
  }));

  // Recent orders (last 5).
  const recentRaw = await prisma.order.findMany({
    where: orderScope,
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }],
    take: 5,
    select: {
      id: true,
      serialNo: true,
      orderDate: true,
      productText: true,
      total: true,
      balanceDue: true,
      simpleStatus: true,
      customer: { select: { name: true } },
    },
  });
  const recentOrders: RecentOrderRow[] = recentRaw.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    orderDate: r.orderDate,
    customerName: r.customer.name,
    productText: r.productText,
    total: r.total.toString(),
    balanceDue: r.balanceDue.toString(),
    simpleStatus: r.simpleStatus,
  }));

  return {
    monthLabel: monthLongLabel(ym),
    monthYm: ym,
    daysLeft: daysLeftInMonth(now),
    target: targetStr,
    targetSource,
    achieved: achieved.toString(),
    achievedPct: achievedPct(achieved.toString(), targetStr),
    amountToReachTarget: amountToReachTarget(achieved.toString(), targetStr).toString(),
    counts,
    paymentReceived,
    balanceToCollect,
    lastSixMonths,
    recentOrders,
  };
}
