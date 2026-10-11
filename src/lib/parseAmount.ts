// Forgiving numeric parser (spec §12.5): "29500", "29,500", "29.5k", "1.5l" → Decimal.
// Returns null on unparseable input. Pure.
import Decimal from "decimal.js";

export function parseAmount(input: string): Decimal | null {
  const t = input.trim().toLowerCase().replace(/[₹,\s]/g, "");
  if (!t) return null;
  const match = /^(\d+(?:\.\d+)?)([kl])?$/.exec(t);
  if (!match) return null;
  const n = new Decimal(match[1]!);
  if (match[2] === "k") return n.mul(1000);
  if (match[2] === "l") return n.mul(100000);
  return n;
}
