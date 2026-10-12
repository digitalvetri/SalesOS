// v1.1 §2 — per-employee monthly target progress.
//
// `achieved` = sum of order totals for non-cancelled orders whose orderDate
// falls within the month, for a given salesperson (matches Excel-sheet logic).
// `achieved%` = round(achieved / target * 100). If target is 0, there is no
// target; callers should branch on `pct === null`.
import Decimal from "decimal.js";
import type { DecimalLike } from "./balance";

const d = (v: DecimalLike): Decimal => (v instanceof Decimal ? v : new Decimal(v));

export function achievedPct(
  achieved: DecimalLike,
  target: DecimalLike,
): number | null {
  const t = d(target);
  if (t.isZero() || t.isNegative()) return null;
  const a = d(achieved);
  return a.div(t).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Over-target when achieved ≥ target (strict Decimal compare — not rounded
 *  so 999/1000 reads as "below target" even though the rounded label would
 *  show 100%). */
export function overTarget(achieved: DecimalLike, target: DecimalLike): boolean {
  const t = d(target);
  if (t.isZero() || t.isNegative()) return false;
  return d(achieved).greaterThanOrEqualTo(t);
}

/** How much more the salesperson needs to book to hit the target. 0 if met. */
export function amountToReachTarget(
  achieved: DecimalLike,
  target: DecimalLike,
): Decimal {
  const t = d(target);
  if (t.isZero() || t.isNegative()) return new Decimal(0);
  const gap = t.minus(d(achieved));
  return gap.isNegative() ? new Decimal(0) : gap;
}
