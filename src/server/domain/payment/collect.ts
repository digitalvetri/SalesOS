// Collect (§5.4, §11.6) — pure overdue / bucket / reminder rules. No DB.
// Business dates are YYYY-MM-DD strings in IST (BR-02); compare as strings,
// do day arithmetic in UTC so DST-free IST math stays exact.
import Decimal from "decimal.js";
import { formatInr } from "@/lib/formatInr";

const DAY_MS = 24 * 60 * 60 * 1000;
/** §13: max 1 reminder per order per 48 h (manual or auto). */
export const REMINDER_COOLDOWN_MS = 48 * 60 * 60 * 1000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export type CollectOrder = {
  balanceDue: Decimal.Value;
  promisedPaymentDate: string | null; // YYYY-MM-DD
  deliveredOn: string | null; // YYYY-MM-DD (IST) of first DELIVERED transition
};

export type OverdueInfo = {
  overdue: boolean;
  /** Days past the due point (0 when not overdue). */
  daysOverdue: number;
  /** The date the money was due: promised date, else delivery + grace. Null if not yet due-able. */
  dueOn: string | null;
};

/**
 * §5.4: Overdue = balanceDue > 0 AND (promised date < today OR
 * (no promised date AND delivered > overdueGraceDays days ago)).
 */
export function overdueInfo(o: CollectOrder, today: string, graceDays: number): OverdueInfo {
  const dueOn = o.promisedPaymentDate ?? (o.deliveredOn ? addDays(o.deliveredOn, graceDays) : null);
  if (!new Decimal(o.balanceDue).greaterThan(0) || !dueOn || dueOn >= today) {
    return { overdue: false, daysOverdue: 0, dueOn };
  }
  return { overdue: true, daysOverdue: daysBetween(dueOn, today), dueOn };
}

export type CollectFilter = "all" | "overdue" | "week" | "today";

/** Filter chips on §11.6. "This week" = promised within the next 7 days (today included). */
export function matchesFilter(
  filter: CollectFilter,
  o: { promisedPaymentDate: string | null; overdue: boolean },
  today: string,
): boolean {
  switch (filter) {
    case "overdue":
      return o.overdue;
    case "today":
      return o.promisedPaymentDate === today;
    case "week":
      return (
        o.promisedPaymentDate !== null &&
        o.promisedPaymentDate >= today &&
        o.promisedPaymentDate <= addDays(today, 6)
      );
    case "all":
    default:
      return true;
  }
}

/** When can the next WhatsApp reminder go out for this order? Null = now. */
export function reminderAvailableAt(lastReminderAt: Date | null, now: Date): Date | null {
  if (!lastReminderAt) return null;
  const next = new Date(lastReminderAt.getTime() + REMINDER_COOLDOWN_MS);
  return next.getTime() > now.getTime() ? next : null;
}

/** Plain-text `payment_reminder` (§13) for the wa.me deep-link fallback. */
export function reminderText(input: {
  customerName: string;
  orders: Array<{ number: string; balanceDue: Decimal.Value }>;
  entityName?: string | null;
}): string {
  const total = input.orders.reduce((s, o) => s.plus(o.balanceDue), new Decimal(0));
  const lines =
    input.orders.length === 1
      ? `${formatInr(total)} is pending for ${input.orders[0]!.number}.`
      : `${formatInr(total)} is pending across ${input.orders.length} orders: ` +
        input.orders.map((o) => `${o.number} (${formatInr(o.balanceDue)})`).join(", ") +
        ".";
  const from = input.entityName ? ` — ${input.entityName}` : "";
  return `Hi ${input.customerName}, gentle reminder: ${lines} Thank you${from}.`;
}

/** wa.me deep link for an E.164 phone (§13 fallback). */
export function waLink(phoneE164: string, text: string): string {
  return `https://wa.me/${phoneE164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}
