// v1.1 §4.3 — parse "62500", "62,500", "62.5k", "₹62,500", "6,25,000" (Indian
// grouping with commas), "1.2 L" (lakhs) into a Decimal.
//
// Returns null on anything we can't confidently parse. Caller shows the
// validation message "Total must be more than ₹0." etc.
import Decimal from "decimal.js";

const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1_000,
  l: 100_000, // Indian "lakh" (also "lakhs")
  lakh: 100_000,
  lakhs: 100_000,
  cr: 10_000_000,
  crore: 10_000_000,
};

export function parseAmount(raw: string): Decimal | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(/₹|,|\s/g, "");
  if (s === "") return null;

  // Trailing suffix: 62.5k / 1.2l / 1.5lakh / 2cr.
  const m = s.match(/^([0-9]*\.?[0-9]+)([a-z]+)?$/);
  if (!m) return null;
  const num = m[1]!;
  const suffix = m[2];

  const d = new Decimal(num);
  if (d.isNaN()) return null;

  if (!suffix) return d;
  const mult = SUFFIX_MULTIPLIER[suffix];
  if (mult === undefined) return null;
  return d.times(mult);
}
