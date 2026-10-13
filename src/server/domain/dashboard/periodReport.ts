// Period report for the admin Overview: a whole year or one month (IST calendar).
// Every figure describes the orders BOOKED in the period (by orderDate), so
// "completed", "pending" and "to collect" always add up to "orders booked".
// Money received is the one exception: payments by paidOn in the period.
// Pure — no IO.
import Decimal from "decimal.js";

export type Period = { kind: "year"; year: number } | { kind: "month"; year: number; month: number };

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** `?p=2026` → the year; `?p=2026-10` → October 2026; anything else → the current month. */
export function parsePeriod(p: string | undefined | null, todayYmd: string): Period {
  const y = Number(todayYmd.slice(0, 4));
  const m = Number(todayYmd.slice(5, 7));
  if (p && /^\d{4}$/.test(p)) return { kind: "year", year: Number(p) };
  const mm = p ? /^(\d{4})-(\d{2})$/.exec(p) : null;
  if (mm && Number(mm[2]) >= 1 && Number(mm[2]) <= 12) return { kind: "month", year: Number(mm[1]), month: Number(mm[2]) };
  return { kind: "month", year: y, month: m };
}

export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
export const periodKey = (p: Period) => (p.kind === "year" ? String(p.year) : ym(p.year, p.month));
export const monthShortName = (month: number) => MONTH_NAMES[month - 1]!;
export const periodLabel = (p: Period) => (p.kind === "year" ? `Year ${p.year}` : `${MONTH_LONG[p.month - 1]} ${p.year}`);

/** Months (YYYY-MM) of the period's year up to `todayYmd` (the whole year for past years). */
export function monthsOfYear(year: number, todayYmd: string): string[] {
  const ty = Number(todayYmd.slice(0, 4));
  const last = year < ty ? 12 : year > ty ? 0 : Number(todayYmd.slice(5, 7));
  return Array.from({ length: last }, (_, i) => ym(year, i + 1));
}

/** One aggregated cell: orders booked in a month by one salesperson. */
export type PeriodCell = {
  ym: string;
  salespersonId: string;
  orders: number; // booked, not cancelled
  cancelled: number;
  value: string; // Σ total of booked orders
  completed: number;
  completedValue: string;
  pending: number;
  pendingPayment: number; // pending with money still to collect
  pendingDelivery: number; // pending, fully paid — not yet delivered/closed
  noAmount: number; // the sheet had no amount
  balance: string; // still to collect on these orders
  paidOnOrders: string; // collected so far on these orders (any date)
  received: string; // money received in this month (by payment date) on this person's orders
};

export type PeriodTotals = Omit<PeriodCell, "ym" | "salespersonId"> & {
  completionPct: number | null; // completed ÷ booked
  collectedPct: number | null; // collected ÷ value (priced orders)
  avgOrder: string | null;
};

const ZERO: Omit<PeriodCell, "ym" | "salespersonId"> = {
  orders: 0, cancelled: 0, value: "0", completed: 0, completedValue: "0", pending: 0, pendingPayment: 0,
  pendingDelivery: 0, noAmount: 0, balance: "0", paidOnOrders: "0", received: "0",
};

const add = (a: string, b: string) => new Decimal(a).plus(b).toString();

export function sumCells(cells: Array<Omit<PeriodCell, "ym" | "salespersonId">>): PeriodTotals {
  const t = cells.reduce(
    (acc, c) => ({
      orders: acc.orders + c.orders,
      cancelled: acc.cancelled + c.cancelled,
      value: add(acc.value, c.value),
      completed: acc.completed + c.completed,
      completedValue: add(acc.completedValue, c.completedValue),
      pending: acc.pending + c.pending,
      pendingPayment: acc.pendingPayment + c.pendingPayment,
      pendingDelivery: acc.pendingDelivery + c.pendingDelivery,
      noAmount: acc.noAmount + c.noAmount,
      balance: add(acc.balance, c.balance),
      paidOnOrders: add(acc.paidOnOrders, c.paidOnOrders),
      received: add(acc.received, c.received),
    }),
    { ...ZERO },
  );
  const value = new Decimal(t.value);
  const priced = t.orders - t.noAmount;
  return {
    ...t,
    completionPct: t.orders ? Math.round((t.completed / t.orders) * 100) : null,
    collectedPct: value.gt(0) ? Math.min(100, Math.round(new Decimal(t.paidOnOrders).div(value).times(100).toNumber())) : null,
    avgOrder: priced > 0 ? value.div(priced).toFixed(0) : null,
  };
}

/** Cells that fall in the period. */
export function inPeriod(cells: PeriodCell[], p: Period): PeriodCell[] {
  const key = periodKey(p);
  return cells.filter((c) => (p.kind === "year" ? c.ym.startsWith(`${key}-`) : c.ym === key));
}

/** Year table: one row per month (Jan → current), plus the year total. */
export function monthlyRows(cells: PeriodCell[], months: string[]): Array<{ ym: string } & PeriodTotals> {
  return months.map((m) => ({ ym: m, ...sumCells(cells.filter((c) => c.ym === m)) }));
}

/** Per-salesperson totals for the period, biggest sales first. */
export function employeeRows<E extends { id: string; name: string }>(
  cells: PeriodCell[],
  employees: E[],
): Array<{ id: string; name: string; sharePct: number | null } & PeriodTotals> {
  const total = cells.reduce((a, c) => a.plus(c.value), new Decimal(0));
  return employees
    .map((e) => {
      const t = sumCells(cells.filter((c) => c.salespersonId === e.id));
      return { id: e.id, name: e.name, sharePct: total.gt(0) ? Math.round(new Decimal(t.value).div(total).times(100).toNumber()) : null, ...t };
    })
    .sort((a, b) => new Decimal(b.value).cmp(a.value) || a.name.localeCompare(b.name));
}

/** Change vs the previous period (null when there is nothing to compare). */
export function changePct(current: Decimal.Value, previous: Decimal.Value): number | null {
  const p = new Decimal(previous);
  if (p.lte(0)) return null;
  return Math.round(new Decimal(current).minus(p).div(p).times(100).toNumber());
}

export function previousPeriod(p: Period): Period {
  if (p.kind === "year") return { kind: "year", year: p.year - 1 };
  return p.month === 1 ? { kind: "month", year: p.year - 1, month: 12 } : { kind: "month", year: p.year, month: p.month - 1 };
}
