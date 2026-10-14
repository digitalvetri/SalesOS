// Delivery-date badge for the production board. Pure and client-safe.
// Dates are calendar days in IST; delivery dates are stored as @db.Date (UTC midnight).

export type DeliveryTone = "overdue" | "today" | "soon" | "later" | "none";
export type DeliveryBadge = { label: string; tone: DeliveryTone; days: number | null };

const DAY = 24 * 60 * 60 * 1000;
const IST_OFFSET = (5 * 60 + 30) * 60 * 1000;

/** "YYYY-MM-DD" for the IST calendar day containing `now`. */
export function istDayKey(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET).toISOString().slice(0, 10);
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / DAY;
}

/**
 * Badge for a delivery date relative to today (IST).
 * `deliveryDate` is a @db.Date value (UTC midnight of the calendar day); `todayKey` from istDayKey().
 */
export function deliveryBadge(deliveryDate: Date | null, todayKey: string): DeliveryBadge {
  if (!deliveryDate) return { label: "No date", tone: "none", days: null };
  const days = dayNumber(deliveryDate.toISOString().slice(0, 10)) - dayNumber(todayKey);
  if (days < 0) {
    const n = -days;
    return { label: `Overdue ${n} ${n === 1 ? "day" : "days"}`, tone: "overdue", days };
  }
  if (days === 0) return { label: "Today", tone: "today", days };
  if (days === 1) return { label: "Tomorrow", tone: "soon", days };
  return { label: `in ${days} days`, tone: days <= 7 ? "soon" : "later", days };
}
