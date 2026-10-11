// Pure balance math for v1.1. Zero IO. No framework imports.
//
// `balance = max(total - paidTotal, 0)` — paying more than the total is treated
// as a refund-pending situation and the balance clamps at 0 (overpayment goes
// to a refund/credit tracked elsewhere — not relevant to this function).
import Decimal from "decimal.js";

export type DecimalLike = string | number | Decimal;

const d = (v: DecimalLike): Decimal => (v instanceof Decimal ? v : new Decimal(v));

export function computeBalance(total: DecimalLike, paidTotal: DecimalLike): Decimal {
  const t = d(total);
  const p = d(paidTotal);
  const b = t.minus(p);
  return b.isNegative() ? new Decimal(0) : b;
}

/** True when the order has been fully paid (balance = 0). */
export function isFullyPaid(total: DecimalLike, paidTotal: DecimalLike): boolean {
  return computeBalance(total, paidTotal).isZero();
}

/** How much a new payment would reduce the balance, clamped so it can't go negative. */
export function applyPayment(
  total: DecimalLike,
  paidTotal: DecimalLike,
  amount: DecimalLike,
): { newPaidTotal: Decimal; newBalance: Decimal; overpayment: Decimal } {
  const t = d(total);
  const prevPaid = d(paidTotal);
  const amt = d(amount);
  if (amt.isNegative()) throw new Error("Payment amount cannot be negative.");
  const nextPaid = prevPaid.plus(amt);
  if (nextPaid.greaterThan(t)) {
    return {
      newPaidTotal: t, // cap at total — overpayment doesn't move the balance below 0
      newBalance: new Decimal(0),
      overpayment: nextPaid.minus(t),
    };
  }
  return {
    newPaidTotal: nextPaid,
    newBalance: t.minus(nextPaid),
    overpayment: new Decimal(0),
  };
}
