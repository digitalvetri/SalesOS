// Order totals (spec BR-08). Pure Decimal math.
//
// Pilot setting `pricesIncludeGst = true` (per TenantSettings default): all list/
// customer/dealer prices are quoted inclusive of GST, so lineTotal = qty * unitPrice.
// The GST breakup is shown for display only.
//
// If pricesIncludeGst = false, the service would add GST on top of lineTotal; we
// keep the branch available but the pilot never uses it.

import Decimal from "decimal.js";
import { dec, roundToPaise, sum } from "@/server/domain/money";

export type LineInput = {
  qty: number; // > 0
  unitPrice: Decimal.Value;
  gstRate: Decimal.Value; // percent, e.g. 18
};

export type ChargeInput = {
  amount: Decimal.Value;
};

export type OrderTotalsInput = {
  lines: LineInput[];
  charges?: ChargeInput[]; // freight, installation, packing, other
  discount?: Decimal.Value;
  pricesIncludeGst: boolean;
};

export type OrderTotals = {
  subtotal: Decimal;    // sum of line totals before charges/discount
  chargesTotal: Decimal; // sum of order charges
  discount: Decimal;
  total: Decimal;        // what the customer owes
  gstBreakup: Decimal;   // GST amount embedded in or added to the subtotal
};

export function computeLineTotal(line: LineInput, pricesIncludeGst: boolean): Decimal {
  if (!Number.isInteger(line.qty) || line.qty <= 0) {
    throw new Error("Line qty must be a positive integer");
  }
  const base = dec(line.unitPrice).mul(line.qty);
  if (pricesIncludeGst) return roundToPaise(base);
  const rate = dec(line.gstRate).div(100);
  return roundToPaise(base.plus(base.mul(rate)));
}

export function computeTotals(input: OrderTotalsInput): OrderTotals {
  const lineTotals = input.lines.map((l) => ({ line: l, lineTotal: computeLineTotal(l, input.pricesIncludeGst) }));

  const subtotal = roundToPaise(sum(lineTotals.map((lt) => lt.lineTotal)));
  const chargesTotal = roundToPaise(sum((input.charges ?? []).map((c) => dec(c.amount))));
  const discount = roundToPaise(input.discount ?? 0);
  const total = roundToPaise(subtotal.plus(chargesTotal).minus(discount));

  // GST breakup: if prices are inclusive, each line's embedded GST = lineTotal - lineTotal/(1 + rate/100).
  // If exclusive, each line's added GST = lineTotal * rate/100 / (1 + rate/100).
  const gstBreakup = roundToPaise(
    sum(
      lineTotals.map(({ line, lineTotal }) => {
        const rate = dec(line.gstRate).div(100);
        if (rate.isZero()) return new Decimal(0);
        if (input.pricesIncludeGst) {
          const base = lineTotal.div(new Decimal(1).plus(rate));
          return lineTotal.minus(base);
        }
        return lineTotal.mul(rate).div(new Decimal(1).plus(rate));
      }),
    ),
  );

  return { subtotal, chargesTotal, discount, total, gstBreakup };
}
