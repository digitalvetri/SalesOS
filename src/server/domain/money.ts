// Money math — Decimal.js wrappers. Spec BR-01: never use JS Number for money.
// Rounding HALF_UP to paise.
import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type DecimalLike = Decimal.Value;

export function dec(v: DecimalLike): Decimal {
  return new Decimal(v);
}

export function roundToPaise(v: DecimalLike): Decimal {
  return dec(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sum(values: Iterable<DecimalLike>): Decimal {
  let total = new Decimal(0);
  for (const v of values) total = total.plus(v);
  return total;
}

export function mul(a: DecimalLike, b: DecimalLike): Decimal {
  return dec(a).mul(b);
}

export function sub(a: DecimalLike, b: DecimalLike): Decimal {
  return dec(a).minus(b);
}

export function eq(a: DecimalLike, b: DecimalLike): boolean {
  return dec(a).equals(b);
}

export function isPositive(v: DecimalLike): boolean {
  return dec(v).isPositive() && !dec(v).isZero();
}

export function isNonNegative(v: DecimalLike): boolean {
  return !dec(v).isNegative();
}

export function toDbString(v: DecimalLike): string {
  return roundToPaise(v).toString();
}
