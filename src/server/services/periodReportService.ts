// Admin Overview — period report (a year, or one month): orders booked per month
// and salesperson, with completed / pending / to-collect for those same orders,
// plus money received by payment date. Two grouped queries cover the selected
// year and the year before (for "vs previous").
import { prisma, type Prisma } from "@/server/repo/client";
import { monthsOfYear, type PeriodCell } from "@/server/domain/dashboard/periodReport";

type OrderAgg = {
  ym: string; sp: string; orders: bigint; cancelled: bigint; value: Prisma.Decimal; completed: bigint;
  completed_value: Prisma.Decimal; pending: bigint; pending_payment: bigint; pending_delivery: bigint;
  no_amount: bigint; balance: Prisma.Decimal; paid: Prisma.Decimal;
};
type PayAgg = { ym: string; sp: string; received: Prisma.Decimal };

export type PeriodReportData = {
  cells: PeriodCell[];
  employees: { id: string; name: string; active: boolean }[];
  years: number[];
  months: string[]; // months of the selected year shown in the table
};

export async function periodReport(opts: { tenantId: string; year: number; todayYmd: string }): Promise<PeriodReportData> {
  const from = `${opts.year - 1}-01-01`;
  const to = `${opts.year + 1}-01-01`;
  const [orders, payments, employees, years] = await Promise.all([
    prisma.$queryRaw<OrderAgg[]>`
      SELECT to_char(o."orderDate", 'YYYY-MM') AS ym, o."salespersonId" AS sp,
        count(*) FILTER (WHERE o."simpleStatus" <> 'CANCELLED') AS orders,
        count(*) FILTER (WHERE o."simpleStatus" = 'CANCELLED') AS cancelled,
        COALESCE(sum(o.total) FILTER (WHERE o."simpleStatus" <> 'CANCELLED'), 0) AS value,
        count(*) FILTER (WHERE o."simpleStatus" = 'DELIVERED') AS completed,
        COALESCE(sum(o.total) FILTER (WHERE o."simpleStatus" = 'DELIVERED'), 0) AS completed_value,
        count(*) FILTER (WHERE o."simpleStatus" = 'PENDING') AS pending,
        count(*) FILTER (WHERE o."simpleStatus" = 'PENDING' AND NOT o."totalMissing" AND o."balanceDue" > 0) AS pending_payment,
        count(*) FILTER (WHERE o."simpleStatus" = 'PENDING' AND NOT o."totalMissing" AND o."balanceDue" <= 0) AS pending_delivery,
        count(*) FILTER (WHERE o."simpleStatus" <> 'CANCELLED' AND o."totalMissing") AS no_amount,
        COALESCE(sum(GREATEST(o."balanceDue", 0)) FILTER (WHERE o."simpleStatus" <> 'CANCELLED' AND NOT o."totalMissing"), 0) AS balance,
        COALESCE(sum(o."paidTotal") FILTER (WHERE o."simpleStatus" <> 'CANCELLED'), 0) AS paid
      FROM "Order" o
      WHERE o."tenantId" = ${opts.tenantId} AND o."orderDate" >= ${from}::date AND o."orderDate" < ${to}::date
      GROUP BY 1, 2`,
    prisma.$queryRaw<PayAgg[]>`
      SELECT to_char(p."paidOn", 'YYYY-MM') AS ym, o."salespersonId" AS sp,
        COALESCE(sum(CASE WHEN p.type = 'REFUND' THEN -p.amount ELSE p.amount END), 0) AS received
      FROM "Payment" p JOIN "Order" o ON o.id = p."orderId"
      WHERE o."tenantId" = ${opts.tenantId} AND p.status <> 'REJECTED' AND o."simpleStatus" <> 'CANCELLED'
        AND p."paidOn" >= ${from}::date AND p."paidOn" < ${to}::date
      GROUP BY 1, 2`,
    prisma.user.findMany({
      where: { tenantId: opts.tenantId, role: "SALES" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    prisma.$queryRaw<{ y: number }[]>`
      SELECT DISTINCT EXTRACT(YEAR FROM "orderDate")::int AS y FROM "Order" WHERE "tenantId" = ${opts.tenantId} ORDER BY 1`,
  ]);

  const key = (ymk: string, sp: string) => `${ymk}|${sp}`;
  const cells = new Map<string, PeriodCell>();
  const cell = (ymk: string, sp: string): PeriodCell => {
    const k = key(ymk, sp);
    let c = cells.get(k);
    if (!c) {
      c = { ym: ymk, salespersonId: sp, orders: 0, cancelled: 0, value: "0", completed: 0, completedValue: "0", pending: 0,
        pendingPayment: 0, pendingDelivery: 0, noAmount: 0, balance: "0", paidOnOrders: "0", received: "0" };
      cells.set(k, c);
    }
    return c;
  };
  for (const r of orders) {
    Object.assign(cell(r.ym, r.sp), {
      orders: Number(r.orders), cancelled: Number(r.cancelled), value: r.value.toString(), completed: Number(r.completed),
      completedValue: r.completed_value.toString(), pending: Number(r.pending), pendingPayment: Number(r.pending_payment),
      pendingDelivery: Number(r.pending_delivery), noAmount: Number(r.no_amount), balance: r.balance.toString(),
      paidOnOrders: r.paid.toString(),
    });
  }
  for (const r of payments) cell(r.ym, r.sp).received = r.received.toString();

  // Salespeople who booked orders but are no longer SALES users still count.
  const known = new Set(employees.map((e) => e.id));
  const missing = [...new Set([...cells.values()].map((c) => c.salespersonId))].filter((id) => !known.has(id));
  const extra = missing.length
    ? await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true, active: true } })
    : [];

  const todayYear = Number(opts.todayYmd.slice(0, 4));
  return {
    cells: [...cells.values()],
    employees: [...employees, ...extra],
    years: [...new Set([...years.map((y) => y.y), todayYear])].sort((a, b) => b - a),
    months: monthsOfYear(opts.year, opts.todayYmd),
  };
}
