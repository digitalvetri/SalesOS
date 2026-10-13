// v1.1 §5.5 — per-employee monthly history for the detail page.
// Each month row = orders whose IST `orderDate` falls in that month
// (non-cancelled): count, booked, how many of them are now completed, their
// remaining balance; payment received = payments with `paidOn` in that month
// (non-rejected, refunds subtracted). Target "0" = no target set.
import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { achievedPct } from "@/server/domain/v1_1/achieved";
import { istYearMonth } from "@/server/domain/fy";
import { averageOrderValue, dateOnly, hasTarget } from "@/server/domain/dashboard/overview";

export type EmployeeMonthRow = {
  ym: string;
  label: string; // "Oct 26"
  orders: number;
  booked: string;
  avgOrder: string; // over orders that have an amount (sheet rows without one excluded)
  target: string; // "0" = no target set
  hasTarget: boolean;
  pct: number | null;
  completed: number;
  paymentReceived: string;
  balance: string;
};

export type EmployeeDetail = {
  user: {
    id: string;
    name: string;
    email: string | null;
    phoneE164: string;
    role: string;
    active: boolean;
    lastLoginAt: Date | null;
    passwordSetAt: Date | null;
  };
  currentMonthYm: string;
  nextMonthYm: string;
  currentTarget: string;
  nextTarget: string;
  defaultTarget: string;
  months: EmployeeMonthRow[];
};

function monthShortLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function employeeDetail(opts: {
  tenantId: string;
  userId: string;
  now?: Date;
  months?: number; // how many months of history
}): Promise<EmployeeDetail | null> {
  const now = opts.now ?? new Date();
  const { year, month } = istYearMonth(now);
  const currentYm = `${year}-${String(month).padStart(2, "0")}`;
  const nextYm = addMonths(currentYm, 1);
  const monthCount = opts.months ?? 6;

  const user = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, id: opts.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phoneE164: true,
      role: true,
      active: true,
      lastLoginAt: true,
      passwordSetAt: true,
    },
  });
  if (!user) return null;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: opts.tenantId },
    select: { defaultMonthlyTarget: true },
  });
  const defaultTarget = settings?.defaultMonthlyTarget.toString() ?? "0";

  // Build the N-month window.
  const ymList: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    ymList.push(addMonths(currentYm, -i));
  }

  const fromDate = dateOnly(`${ymList[0]!}-01`);
  const toDate = dateOnly(`${addMonths(currentYm, 1)}-01`);

  // Aggregate booked + completed per month in one SQL pass. orderDate is a
  // date column, so to_char needs no time-zone shift.
  const stats = await prisma.$queryRaw<
    { month: string; orders: bigint; priced: bigint; booked: Prisma.Decimal; completed: bigint; balance: Prisma.Decimal }[]
  >`
    SELECT to_char("orderDate", 'YYYY-MM') AS month,
           COUNT(*)::bigint AS orders,
           COUNT(*) FILTER (WHERE NOT "totalMissing")::bigint AS priced,
           COALESCE(SUM(total), 0) AS booked,
           COUNT(*) FILTER (WHERE "simpleStatus" = 'COMPLETED')::bigint AS completed,
           COALESCE(SUM(GREATEST("balanceDue", 0)), 0) AS balance
    FROM "Order"
    WHERE "tenantId" = ${opts.tenantId}
      AND "salespersonId" = ${opts.userId}
      AND "simpleStatus" <> 'CANCELLED'
      AND "orderDate" >= ${fromDate}::date
      AND "orderDate" < ${toDate}::date
    GROUP BY 1
  `;
  const statsBy = new Map(
    stats.map((r) => [
      r.month,
      {
        orders: Number(r.orders),
        priced: Number(r.priced),
        booked: r.booked.toString(),
        completed: Number(r.completed),
        balance: r.balance.toString(),
      },
    ]),
  );

  // Payment received per month (by paidOn; refunds subtract).
  const payRows = await prisma.$queryRaw<{ month: string; s: Prisma.Decimal }[]>`
    SELECT to_char(p."paidOn", 'YYYY-MM') AS month,
           COALESCE(SUM(CASE WHEN p.type = 'REFUND' THEN -p.amount ELSE p.amount END), 0) AS s
    FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
    WHERE o."tenantId" = ${opts.tenantId}
      AND o."salespersonId" = ${opts.userId}
      AND p.status <> 'REJECTED'
      AND o."simpleStatus" <> 'CANCELLED'
      AND p."paidOn" >= ${fromDate}::date
      AND p."paidOn" < ${toDate}::date
    GROUP BY 1
  `;
  const payBy = new Map(payRows.map((r) => [r.month, r.s.toString()]));

  // Targets.
  const targets = await prisma.salesTarget.findMany({
    where: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      month: {
        in: ymList.concat([nextYm]).map((ym) => {
          const [y, m] = ym.split("-").map(Number) as [number, number];
          return new Date(Date.UTC(y, m - 1, 1));
        }),
      },
    },
    select: { month: true, amount: true },
  });
  const targetBy = new Map(
    targets.map((t) => [t.month.toISOString().slice(0, 7), t.amount.toString()]),
  );

  const months: EmployeeMonthRow[] = ymList.map((ym) => {
    const s = statsBy.get(ym) ?? { orders: 0, priced: 0, booked: "0", completed: 0, balance: "0" };
    const rawTarget = targetBy.get(ym) ?? defaultTarget;
    const real = hasTarget(rawTarget);
    const pay = payBy.get(ym) ?? "0";
    return {
      ym,
      label: monthShortLabel(ym),
      orders: s.orders,
      booked: s.booked,
      avgOrder: averageOrderValue(s.booked, s.priced),
      target: real ? rawTarget : "0",
      hasTarget: real,
      pct: real ? achievedPct(s.booked, rawTarget) : null,
      completed: s.completed,
      paymentReceived: pay,
      balance: s.balance,
    };
  });

  return {
    user,
    currentMonthYm: currentYm,
    nextMonthYm: nextYm,
    currentTarget: targetBy.get(currentYm) ?? defaultTarget,
    nextTarget: targetBy.get(nextYm) ?? defaultTarget,
    defaultTarget,
    months,
  };
}

/** Set a SalesTarget row (upsert). */
export async function adminSetTarget(opts: {
  tenantId: string;
  actorId: string;
  userId: string;
  monthYm: string; // "2026-10"
  amount: string;
}) {
  const [y, m] = opts.monthYm.split("-").map(Number) as [number, number];
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const amount = new Decimal(opts.amount);
  if (amount.isNaN() || amount.isNegative()) {
    throw new Error("Target must be ≥ 0.");
  }
  return prisma.salesTarget.upsert({
    where: {
      tenantId_userId_month: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        month: monthStart,
      },
    },
    create: {
      tenantId: opts.tenantId,
      userId: opts.userId,
      month: monthStart,
      amount: amount.toFixed(2),
    },
    update: { amount: amount.toFixed(2) },
  });
}
