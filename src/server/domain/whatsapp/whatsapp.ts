// WhatsApp (§13) — pure rules: the four templates, the reminder schedule and
// webhook status ordering. No I/O.
import Decimal from "decimal.js";
import { formatInr } from "@/lib/formatInr";
import { REMINDER_COOLDOWN_MS } from "@/server/domain/payment/collect";

export const TEMPLATES = ["order_confirmation", "payment_received", "dispatch_update", "payment_reminder"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

export type TemplateInput =
  | {
      template: "order_confirmation";
      name: string; orderNumber: string; items: string; total: Decimal.Value; advance: Decimal.Value;
      balance: Decimal.Value; deliveryDate: string | null; entityName: string;
    }
  | { template: "payment_received"; name: string; amount: Decimal.Value; receiptNo: string; balance: Decimal.Value }
  | { template: "dispatch_update"; name: string; orderNumber: string; items: string; transporter: string | null; lrNumber: string | null }
  | { template: "payment_reminder"; name: string; orderNumber: string; balance: Decimal.Value; payTo: string | null };

const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

/** Ordered body parameters for the Meta template (as registered in Business Manager). */
export function templateParams(t: TemplateInput): string[] {
  switch (t.template) {
    case "order_confirmation":
      return [t.name, t.orderNumber, t.items, formatInr(t.total), formatInr(t.advance), formatInr(t.balance), t.deliveryDate ? day(t.deliveryDate) : "—", t.entityName];
    case "payment_received":
      return [t.name, formatInr(t.amount), t.receiptNo, formatInr(t.balance)];
    case "dispatch_update":
      return [t.name, t.orderNumber, t.items, t.transporter ?? "—", t.lrNumber ?? "—"];
    case "payment_reminder":
      return [t.name, t.orderNumber, formatInr(t.balance), t.payTo ?? "—"];
  }
}

/** English text matching §13's examples — used for the wa.me fallback. */
export function templateText(t: TemplateInput): string {
  switch (t.template) {
    case "order_confirmation":
      return (
        `Hi ${t.name}, thank you for your order ${t.orderNumber} with ${t.entityName}: ${t.items}. ` +
        `Total ${formatInr(t.total)}, advance ${formatInr(t.advance)}, balance ${formatInr(t.balance)}.` +
        (t.deliveryDate ? ` Expected delivery ${day(t.deliveryDate)}.` : "")
      );
    case "payment_received":
      return `Received ${formatInr(t.amount)} (${t.receiptNo}). Balance now ${formatInr(t.balance)}. Thank you!`;
    case "dispatch_update":
      return `Your machines for ${t.orderNumber} have been dispatched${t.transporter ? ` via ${t.transporter}` : ""}${t.lrNumber ? `, LR ${t.lrNumber}` : ""}: ${t.items}.`;
    case "payment_reminder":
      return `Gentle reminder: ${formatInr(t.balance)} is pending for ${t.orderNumber}.${t.payTo ? ` ${t.payTo}.` : ""} Thank you.`;
  }
}

// ───────── Reminder schedule (§5.4 auto-reminders, §13 rate limit) ─────────

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** §5.4: never on Sundays, 10:00–19:00 IST only. */
export function isWithinSendWindow(now: Date): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  if (ist.getUTCDay() === 0) return false;
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 10 * 60 && minutes < 19 * 60;
}

export type AutoReminderState = {
  overdue: boolean;
  lastReminderAt: Date | null; // any channel-WHATSAPP reminder, manual or auto
  autoRemindersSent: number;
};

export type AutoReminderDecision =
  | { send: true }
  | { send: false; reason: "not_overdue" | "max_reached" | "cooldown" | "not_due_yet" };

/**
 * §5.4: auto-reminders every N days for overdue orders, max M (default 3).
 * §13: never more than 1 per order per 48 h, manual or auto.
 */
export function autoReminderDecision(s: AutoReminderState, now: Date, everyDays: number, maxCount: number): AutoReminderDecision {
  if (!s.overdue) return { send: false, reason: "not_overdue" };
  if (s.autoRemindersSent >= maxCount) return { send: false, reason: "max_reached" };
  if (s.lastReminderAt) {
    const since = now.getTime() - s.lastReminderAt.getTime();
    if (since < REMINDER_COOLDOWN_MS) return { send: false, reason: "cooldown" };
    if (since < everyDays * 86_400_000) return { send: false, reason: "not_due_yet" };
  }
  return { send: true };
}

// ───────── Webhook statuses ─────────

const RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3 };

/**
 * Meta delivers status callbacks out of order and more than once. Only move
 * forward (sent → delivered → read); FAILED is terminal; never overwrite FAILED/DEEPLINK.
 */
export function nextStatus(current: string, incoming: string): string | null {
  const inc = incoming.toUpperCase();
  if (current === "FAILED" || current === "DEEPLINK") return null;
  if (inc === "FAILED") return "FAILED";
  if (!(inc in RANK)) return null;
  return (RANK[inc] ?? -1) > (RANK[current] ?? -1) ? inc : null;
}
