// BR-08 — order totals. Pilot setting pricesIncludeGst = true.
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { computeTotals, computeLineTotal } from "@/server/domain/order/totals";

describe("computeLineTotal — pricesIncludeGst=true", () => {
  it("qty × unitPrice (prices already carry GST)", () => {
    expect(
      computeLineTotal({ qty: 2, unitPrice: 29500, gstRate: 18 }, true).toString(),
    ).toBe("59000");
  });

  it("rounds to paise half-up", () => {
    // 3 × 1000.333 = 3000.999 → 3001.00
    const t = computeLineTotal({ qty: 3, unitPrice: "1000.333", gstRate: 18 }, true);
    expect(t.toString()).toBe("3001");
  });

  it("rejects non-positive integer qty", () => {
    expect(() => computeLineTotal({ qty: 0, unitPrice: 1000, gstRate: 18 }, true)).toThrow();
    expect(() => computeLineTotal({ qty: -1, unitPrice: 1000, gstRate: 18 }, true)).toThrow();
    expect(() => computeLineTotal({ qty: 1.5, unitPrice: 1000, gstRate: 18 }, true)).toThrow();
  });
});

describe("computeLineTotal — pricesIncludeGst=false", () => {
  it("adds GST on top of qty × unitPrice", () => {
    // 2 × 10000 + 18% = 23600
    expect(
      computeLineTotal({ qty: 2, unitPrice: 10000, gstRate: 18 }, false).toString(),
    ).toBe("23600");
  });
});

describe("computeTotals", () => {
  it("sums line totals + charges, subtracts discount", () => {
    const result = computeTotals({
      lines: [
        { qty: 1, unitPrice: 29500, gstRate: 18 }, // 29500
        { qty: 1, unitPrice: 33000, gstRate: 18 }, // 33000
      ],
      charges: [{ amount: 500 }],
      discount: 200,
      pricesIncludeGst: true,
    });
    expect(result.subtotal.toString()).toBe("62500");
    expect(result.chargesTotal.toString()).toBe("500");
    expect(result.discount.toString()).toBe("200");
    expect(result.total.toString()).toBe("62800");
  });

  it("GST breakup (inclusive) backs out the embedded tax", () => {
    // ₹59,000 inclusive of 18% ⇒ base ≈ 50000, GST = 9000
    const result = computeTotals({
      lines: [{ qty: 2, unitPrice: 29500, gstRate: 18 }],
      pricesIncludeGst: true,
    });
    expect(result.subtotal.toString()).toBe("59000");
    expect(result.gstBreakup.toString()).toBe("9000");
  });

  it("GST breakup (exclusive) matches what was added on top", () => {
    const result = computeTotals({
      lines: [{ qty: 2, unitPrice: 10000, gstRate: 18 }],
      pricesIncludeGst: false,
    });
    expect(result.subtotal.toString()).toBe("23600");
    // line gets lineTotal × rate / (1+rate) = 23600 × 0.18 / 1.18 = 3600
    expect(result.gstBreakup.toString()).toBe("3600");
  });

  it("zero-GST lines contribute 0 to the breakup", () => {
    const result = computeTotals({
      lines: [{ qty: 1, unitPrice: 100, gstRate: 0 }],
      pricesIncludeGst: true,
    });
    expect(result.gstBreakup.toString()).toBe("0");
    expect(result.total.toString()).toBe("100");
  });

  it("empty line list produces zeros", () => {
    const r = computeTotals({ lines: [], pricesIncludeGst: true });
    expect(r.subtotal.toString()).toBe("0");
    expect(r.total.toString()).toBe("0");
  });

  it("works with Decimal.Value strings", () => {
    const r = computeTotals({
      lines: [{ qty: 1, unitPrice: "32500", gstRate: "18" }],
      charges: [{ amount: new Decimal(100.5) }],
      pricesIncludeGst: true,
    });
    expect(r.total.toString()).toBe("32600.5");
  });
});
