// Dashboard periods + aging (§9). Pure. Business dates are IST (BR-02);
// periods are inclusive YYYY-MM-DD ranges compared against `date` columns.
import { addDays, daysBetween } from "@/server/domain/payment/collect";
import { istDateString } from "@/server/domain/payment/record";

export type PeriodKey = "this_month" | "last_month" | "this_fy" | "last_30";
export type Period = { key: PeriodKey; from: string; to: string };

function monthStart(d: string): string {
  return `${d.slice(0, 7)}-01`;
}
function monthEnd(d: string): string {
  const [y, m] = d.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); // day 0 of next month
}

/** Resolve a period key against "today" in IST. Default (§9): this month. */
export function resolvePeriod(key: PeriodKey | undefined, now: Date): Period {
  const today = istDateString(now);
  switch (key) {
    case "last_month": {
      const prev = addDays(monthStart(today), -1);
      return { key, from: monthStart(prev), to: monthEnd(prev) };
    }
    case "this_fy": {
      const [y, m] = today.split("-").map(Number) as [number, number];
      const fyStartYear = m >= 4 ? y : y - 1;
      return { key, from: `${fyStartYear}-04-01`, to: today };
    }
    case "last_30":
      return { key, from: addDays(today, -29), to: today };
    case "this_month":
    default:
      return { key: "this_month", from: monthStart(today), to: today };
  }
}

/** The same-length window just before `p` (for "▲ 12% vs Sep"). Months compare to the whole previous month. */
export function previousPeriod(p: Period): { from: string; to: string } {
  if (p.key === "this_month" || p.key === "last_month") {
    const prev = addDays(p.from, -1);
    return { from: monthStart(prev), to: monthEnd(prev) };
  }
  const len = daysBetween(p.from, p.to);
  const to = addDays(p.from, -1);
  return { from: addDays(to, -len), to };
}

/** Percent change, rounded to a whole number; null when there's no base to compare to. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export const AGING_BUCKETS = ["0-15", "16-30", "31-60", "60+"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** §9 overdue aging buckets by days overdue. */
export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 15) return "0-15";
  if (daysOverdue <= 30) return "16-30";
  if (daysOverdue <= 60) return "31-60";
  return "60+";
}

/** Last 12 IST months ending with the month of `today`, oldest first, as YYYY-MM. */
export function last12Months(today: string): string[] {
  const out: string[] = [];
  let cursor = monthStart(today);
  for (let i = 0; i < 12; i++) {
    out.unshift(cursor.slice(0, 7));
    cursor = monthStart(addDays(cursor, -1));
  }
  return out;
}
