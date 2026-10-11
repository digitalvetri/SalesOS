// Server-safe currency formatter. Lives outside components/app/Money.tsx so
// Server Components can import it without crossing the "use client" boundary.
import Decimal from "decimal.js";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const INR_WITH_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatInr(value: Decimal.Value, signed?: boolean): string {
  const d = new Decimal(value);
  const hasPaise = !d.modulo(1).isZero();
  const abs = d.abs();
  const fmt = (hasPaise ? INR_WITH_PAISE : INR).format(abs.toNumber());
  if (d.isNegative()) return `−${fmt}`;
  if (signed) return `+${fmt}`;
  return fmt;
}
