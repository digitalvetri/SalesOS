// Pure helpers for the admin Overview, employee home and Employees pages.
// No DB. Business dates are IST calendar dates (BR-02) handled as YYYY-MM-DD
// strings. `orderDate`, `completedAt` and `paidOn` are Postgres `date`
// columns: Prisma reads/writes them as UTC-midnight Dates, so a filter bound
// must be UTC midnight of the IST date — an IST-shifted instant such as
// 2026-09-30T18:30Z is truncated to 2026-09-30 and pulls in the wrong day.
import Decimal from "decimal.js";
import { addDays, daysBetween } from "@/server/domain/payment/collect";
import { istDateString } from "@/server/domain/payment/record";
import { readSheetRow } from "@/server/domain/import/sheetRow";

/** UTC-midnight Date for a YYYY-MM-DD business date (what a `date` column holds). */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** YYYY-MM-DD of a value read from a `date` column. */
export function ymdOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function monthStartOf(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}

function daysInMonthOf(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export type MonthWindow = {
  today: string; // IST today
  ym: string; // "2026-10"
  monthStart: string; // "2026-10-01" (inclusive)
  nextMonthStart: string; // "2026-11-01" (exclusive)
  dayOfMonth: number;
  daysInMonth: number;
  daysLeft: number; // days after today in this month
  prevYm: string;
  prevStart: string; // "2026-09-01" (inclusive)
  /** Exclusive end of "previous month up to the same day": Sep 1..Sep 13 → "2026-09-14". Clamped to the previous month's length. */
  prevSameDayEnd: string;
};

/** The IST calendar month containing `now`, plus the previous-month same-day window for deltas. */
export function monthWindow(now: Date): MonthWindow {
  const today = istDateString(now);
  const monthStart = monthStartOf(today);
  const dim = daysInMonthOf(today);
  const nextMonthStart = addDays(monthStart, dim);
  const prevStart = monthStartOf(addDays(monthStart, -1));
  const dom = Number(today.slice(8, 10));
  const prevDim = daysInMonthOf(prevStart);
  return {
    today,
    ym: today.slice(0, 7),
    monthStart,
    nextMonthStart,
    dayOfMonth: dom,
    daysInMonth: dim,
    daysLeft: dim - dom,
    prevYm: prevStart.slice(0, 7),
    prevStart,
    prevSameDayEnd: addDays(prevStart, Math.min(dom, prevDim)),
  };
}

/** % of the month elapsed by the end of today — where an on-pace salesperson should be. */
export function paceToday(w: Pick<MonthWindow, "dayOfMonth" | "daysInMonth">): number {
  return Math.round((w.dayOfMonth / w.daysInMonth) * 100);
}

/** Whole IST days from a business date to today (never negative). */
export function daysSince(fromYmd: string, today: string): number {
  return Math.max(0, daysBetween(fromYmd, today));
}

/** "today" / "yesterday" / "3 days ago" / "12 Sep" for an order date. */
export function orderDayLabel(orderYmd: string, today: string): string {
  const n = daysBetween(orderYmd, today);
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  if (n < 7) return `${n} days ago`;
  return formatOrderDate(orderYmd);
}

/** Per-employee chip: when their most recent order (by order date) was. */
export function lastOrderChip(lastOrderYmd: string | null, today: string): string | null {
  if (!lastOrderYmd) return null;
  const n = daysBetween(lastOrderYmd, today);
  if (n <= 0) return "last order today";
  if (n === 1) return "last order yesterday";
  return `no order in ${n} days`;
}

/** "12 Oct" (adds the year when it isn't `today`'s year). */
export function formatOrderDate(ymd: string, today?: string): string {
  const withYear = today !== undefined && today.slice(0, 4) !== ymd.slice(0, 4);
  return dateOnly(ymd).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * Customer name to show for an order. Imported orders keep the sheet's
 * customer name (one dealer phone is shared by several names, so the linked
 * Customer row may carry a different one). Blank → "—".
 */
export function displayCustomerName(sheetRow: unknown, customerName: string | null | undefined): string {
  const fromSheet = readSheetRow(sheetRow)?.customer?.trim();
  if (fromSheet) return fromSheet;
  const own = customerName?.trim();
  return own ? own : "—";
}

/**
 * Month-over-month change in whole percent. Null ("no comparison") when the
 * previous value is 0 — a % change from nothing is meaningless.
 */
export function deltaPct(current: Decimal.Value, previous: Decimal.Value): number | null {
  const p = new Decimal(previous);
  if (p.isZero()) return null;
  return new Decimal(current).minus(p).div(p.abs()).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** A target counts only when it is a positive amount; ₹0 / missing = "No target set". */
export function hasTarget(target: Decimal.Value | null | undefined): boolean {
  if (target === null || target === undefined) return false;
  return new Decimal(target).greaterThan(0);
}

export type PaceVerdict = "achieved" | "on_pace" | "behind" | "none";

/** Behind = under 85 % of where pace says they should be. No target → no verdict. */
export function paceVerdict(pct: number | null, pace: number): PaceVerdict {
  if (pct === null) return "none";
  if (pct >= 100) return "achieved";
  return pct < pace * 0.85 ? "behind" : "on_pace";
}

/** Rows with a target first (highest % first), then the rest by month's sales (highest first), then name. */
export function sortTargetRows<T extends { name: string; pct: number | null; achieved: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.pct !== null && b.pct !== null) return b.pct - a.pct || a.name.localeCompare(b.name);
    if (a.pct !== null) return -1;
    if (b.pct !== null) return 1;
    return new Decimal(b.achieved).comparedTo(a.achieved) || a.name.localeCompare(b.name);
  });
}

export type TeamTotals = {
  achieved: string; // everyone's sales this month
  target: string; // Σ real (positive) targets only
  achievedOfTargeted: string; // sales of the people who have a target
  withTarget: number;
  pct: number | null; // achievedOfTargeted / target; null when nobody has a target
};

/** Team total row: sums only real targets so a ₹0 target never dilutes the %. */
export function teamTotals(rows: Array<{ achieved: string; target: string }>): TeamTotals {
  let achieved = new Decimal(0);
  let target = new Decimal(0);
  let achievedOfTargeted = new Decimal(0);
  let withTarget = 0;
  for (const r of rows) {
    achieved = achieved.plus(r.achieved);
    if (hasTarget(r.target)) {
      target = target.plus(r.target);
      achievedOfTargeted = achievedOfTargeted.plus(r.achieved);
      withTarget += 1;
    }
  }
  return {
    achieved: achieved.toString(),
    target: target.toString(),
    achievedOfTargeted: achievedOfTargeted.toString(),
    withTarget,
    pct: target.isZero()
      ? null
      : achievedOfTargeted.div(target).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
  };
}

/** Average order value over orders that actually have an amount (sheet rows with no total are excluded). */
export function averageOrderValue(total: Decimal.Value, pricedOrders: number): string {
  if (pricedOrders <= 0) return "0";
  return new Decimal(total).div(pricedOrders).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toString();
}
