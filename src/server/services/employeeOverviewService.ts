// v1.1 §4.2 — one query per metric for the employee Overview page.
// Same definitions as the admin Overview (adminOverviewService): orders by
// IST `orderDate`, payments by `paidOn` (non-rejected, refunds subtracted),
// cancelled orders excluded, "to collect" = Σ balanceDue > 0 over
// non-cancelled orders that have an amount.
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { achievedPct, amountToReachTarget } from "@/server/domain/v1_1/achieved";
import {
  dateOnly,
  displayCustomerName,
  hasTarget,
  monthWindow,
} from "@/server/domain/dashboard/overview";

export type RecentOrderRow = {
  id: string;
  serialNo: number | null;
  orderDate: Date;
  customerName: string;
  totalMissing: boolean;
  productText: string | null;
  total: string;
  balanceDue: string;
  simpleStatus: "PENDING" | "DELIVERED" | "CANCELLED";
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
  lastSixMonths: Array<{ ym: string; label: string; achieved: string; target: string }>;
  recentOrders: RecentOrderRow[];
};

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

export async function employeeOverview(opts: {
  tenantId: string;
  userId: string;
  now?: Date;
}): Promise<EmployeeOverview> {
  const now = opts.now ?? new Date();
  const w = monthWindow(now);
  const ym = w.ym;
  const [year, month] = ym.split("-").map(Number) as [number, number];
  // `orderDate` / SalesTarget.month are date columns → UTC-midnight bounds.
  const monthStart = dateOnly(w.monthStart);
  const monthRange = { gte: monthStart, lt: dateOnly(w.nextMonthStart) };

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

  // A ₹0 target (explicit or default) means "no target set".
  const rawTarget = targetRow?.amount.toString() ?? settings?.defaultMonthlyTarget.toString() ?? "0";
  const targetStr = hasTarget(rawTarget) ? rawTarget : "0";
  const targetSource: EmployeeOverview["targetSource"] = !hasTarget(rawTarget)
    ? "None"
    : targetRow
      ? "SalesTarget"
      : "DefaultSetting";

  // Scoped base — every query filters by (tenantId, salespersonId) on Order.
  const orderScope: Prisma.OrderWhereInput = {
    tenantId: opts.tenantId,
    salespersonId: opts.userId,
  };

  // Achieved (non-cancelled) + counts for this month.
  const monthOrders = await prisma.order.findMany({
    where: {
      ...orderScope,
      orderDate: monthRange,
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
    completed: monthOrders.filter((o) => o.simpleStatus === "DELIVERED").length,
    pending: monthOrders.filter((o) => o.simpleStatus === "PENDING").length,
  };

  // Payment received this month — Σ payments by paidOn, scoped to this user's orders.
  const paymentsRow = await prisma.$queryRaw<{ s: Prisma.Decimal }[]>`
    SELECT COALESCE(SUM(CASE WHEN p.type = 'REFUND' THEN -p.amount ELSE p.amount END), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${opts.tenantId}
      AND o."salespersonId" = ${opts.userId}
      AND p.status <> 'REJECTED'
      AND p."paidOn" >= ${w.monthStart}::date
      AND p."paidOn" < ${w.nextMonthStart}::date
      AND o."simpleStatus" <> 'CANCELLED'
  `;
  const paymentReceived = paymentsRow[0]?.s.toString() ?? "0";

  // Balance to collect = Σ balanceDue across all this user's open orders.
  const openOrders = await prisma.order.findMany({
    where: {
      ...orderScope,
      simpleStatus: { not: "CANCELLED" },
      balanceDue: { gt: 0 },
      totalMissing: false,
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
  const sixStart = dateOnly(`${sixMonths[0]!}-01`);
  const [sixRows, sixTargets] = await Promise.all([
    prisma.$queryRaw<{ month: string; booked: Prisma.Decimal }[]>`
      SELECT to_char("orderDate", 'YYYY-MM') AS month,
             COALESCE(SUM(total), 0) AS booked
      FROM "Order"
      WHERE "tenantId" = ${opts.tenantId}
        AND "salespersonId" = ${opts.userId}
        AND "simpleStatus" <> 'CANCELLED'
        AND "orderDate" >= ${sixStart}::date
        AND "orderDate" < ${w.nextMonthStart}::date
      GROUP BY 1
    `,
    prisma.salesTarget.findMany({
      where: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        month: { in: sixMonths.map((m) => dateOnly(`${m}-01`)) },
      },
      select: { month: true, amount: true },
    }),
  ]);
  const byMonth = new Map(sixRows.map((r) => [r.month, r.booked.toString()]));
  const targetByMonth = new Map(sixTargets.map((t) => [t.month.toISOString().slice(0, 7), t.amount.toString()]));
  const defaultTarget = settings?.defaultMonthlyTarget.toString() ?? "0";
  const lastSixMonths = sixMonths.map((ym) => {
    const t = targetByMonth.get(ym) ?? defaultTarget;
    return {
      ym,
      label: monthShortLabel(ym),
      achieved: byMonth.get(ym) ?? "0",
      target: hasTarget(t) ? t : "0",
    };
  });

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
      totalMissing: true,
      sheetRow: true,
      customer: { select: { name: true } },
    },
  });
  const recentOrders: RecentOrderRow[] = recentRaw.map((r) => ({
    id: r.id,
    serialNo: r.serialNo,
    orderDate: r.orderDate,
    customerName: displayCustomerName(r.sheetRow, r.customer.name),
    totalMissing: r.totalMissing,
    productText: r.productText,
    total: r.total.toString(),
    balanceDue: r.balanceDue.toString(),
    simpleStatus: r.simpleStatus,
  }));

  return {
    monthLabel: monthLongLabel(ym),
    monthYm: ym,
    daysLeft: w.daysLeft,
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
