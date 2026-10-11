// Dispatch rules (§5.3, §5.5). Pure — no DB, no framework imports.
// Business dates are YYYY-MM-DD strings in IST (BR-02).
import { daysBetween } from "@/server/domain/payment/collect";

export type LineQty = { id: string; qty: number; dispatchedQty: number };
export type Pick = { orderLineId: string; qty: number };

export class DispatchRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchRuleError";
  }
}

/** Status implied by dispatched quantities: nothing → null, some → PARTIAL, all → DISPATCHED. */
export function dispatchStatusFor(lines: LineQty[]): "PARTIALLY_DISPATCHED" | "DISPATCHED" | null {
  const shipped = lines.reduce((s, l) => s + l.dispatchedQty, 0);
  if (shipped === 0) return null;
  return lines.every((l) => l.dispatchedQty >= l.qty) ? "DISPATCHED" : "PARTIALLY_DISPATCHED";
}

/**
 * Validates a dispatch (lines + qty, §5.3) against what is still to ship and
 * returns the new per-line dispatched quantities and the resulting status.
 */
export function applyDispatch(
  lines: LineQty[],
  picks: Pick[],
): { dispatched: Map<string, number>; status: "PARTIALLY_DISPATCHED" | "DISPATCHED" } {
  const chosen = picks.filter((p) => p.qty !== 0);
  if (chosen.length === 0) throw new DispatchRuleError("Pick at least one machine to dispatch.");
  const seen = new Set<string>();
  const byId = new Map(lines.map((l) => [l.id, l]));
  const next = new Map(lines.map((l) => [l.id, l.dispatchedQty]));
  for (const p of chosen) {
    if (!Number.isInteger(p.qty) || p.qty < 0) throw new DispatchRuleError("Quantities must be whole numbers.");
    if (seen.has(p.orderLineId)) throw new DispatchRuleError("Each line can appear once per dispatch.");
    seen.add(p.orderLineId);
    const line = byId.get(p.orderLineId);
    if (!line) throw new DispatchRuleError("That line is not on this order.");
    const remaining = line.qty - line.dispatchedQty;
    if (p.qty > remaining) {
      throw new DispatchRuleError(`Only ${remaining} left to dispatch on that line.`);
    }
    next.set(line.id, line.dispatchedQty + p.qty);
  }
  const after = lines.map((l) => ({ ...l, dispatchedQty: next.get(l.id)! }));
  return { dispatched: next, status: dispatchStatusFor(after)! };
}

/** Remaining quantity per line — the default picks for "dispatch everything left". */
export function remainingPicks(lines: LineQty[]): Pick[] {
  return lines
    .filter((l) => l.qty > l.dispatchedQty)
    .map((l) => ({ orderLineId: l.id, qty: l.qty - l.dispatchedQty }));
}

/** DELIVERED once every machine has shipped and every dispatch is confirmed delivered. */
export function isFullyDelivered(lines: LineQty[], dispatches: { delivered: boolean }[]): boolean {
  return dispatchStatusFor(lines) === "DISPATCHED" && dispatches.length > 0 && dispatches.every((d) => d.delivered);
}

// ───────── §5.5 stuck orders ─────────

export type StuckInput = {
  status: string;
  confirmedOn: string; // date the order became CONFIRMED (approval date, else order date)
  promisedDeliveryDate: string | null;
};

export type StuckInfo = { stuck: boolean; ageDays: number; late: boolean; daysLate: number };

/**
 * §5.5: an order in CONFIRMED or IN_PRODUCTION longer than `productionAlertDays`,
 * or past its promised delivery date, is "stuck".
 */
export function stuckInfo(o: StuckInput, today: string, productionAlertDays: number): StuckInfo {
  const ageDays = Math.max(0, daysBetween(o.confirmedOn, today));
  const inProduction = o.status === "CONFIRMED" || o.status === "IN_PRODUCTION";
  // Late until everything has shipped — a part dispatch still owes machines.
  const shipped = ["DISPATCHED", "DELIVERED", "CLOSED", "CANCELLED"].includes(o.status);
  const late = !shipped && o.promisedDeliveryDate !== null && o.promisedDeliveryDate < today;
  const daysLate = late ? daysBetween(o.promisedDeliveryDate!, today) : 0;
  return { stuck: (inProduction && ageDays > productionAlertDays) || late, ageDays, late, daysLate };
}

// ───────── Board ─────────

export const BOARD_COLUMNS = ["CONFIRMED", "IN_PRODUCTION", "READY", "DISPATCHED"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];

/** PARTIALLY_DISPATCHED orders sit in READY (more to ship) — §11.10 has four columns. */
export function boardColumnFor(status: string): BoardColumn | null {
  switch (status) {
    case "CONFIRMED":
    case "IN_PRODUCTION":
    case "READY":
    case "DISPATCHED":
      return status;
    case "PARTIALLY_DISPATCHED":
      return "READY";
    default:
      return null;
  }
}

/**
 * [GOLD] on §11.10 = the action on the oldest overdue card. With nothing
 * overdue, the oldest card still waiting on the workshop gets it, so the
 * screen always has exactly one gold action (§10.4).
 */
export function pickGoldCard<T extends { id: string; stuck: boolean; ageDays: number; column: BoardColumn }>(
  cards: T[],
): string | null {
  const actionable = cards.filter((c) => c.column !== "DISPATCHED");
  const pool = actionable.some((c) => c.stuck) ? actionable.filter((c) => c.stuck) : actionable;
  if (pool.length === 0) return cards.length > 0 ? oldest(cards).id : null;
  return oldest(pool).id;
}

function oldest<T extends { id: string; ageDays: number }>(cards: T[]): T {
  return cards.reduce((a, b) => (b.ageDays > a.ageDays || (b.ageDays === a.ageDays && b.id < a.id) ? b : a));
}
