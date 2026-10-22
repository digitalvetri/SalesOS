// Itemised new orders (2026-10-22): the server works out line amounts, the total and the summary.
import { describe, it, expect } from "vitest";
import { priceOrderItems } from "@/server/services/orderV2Service";

describe("priceOrderItems", () => {
  it("multiplies qty × price and sums the order", () => {
    const r = priceOrderItems([
      { name: " 7 LTR WET GRINDER ", qty: 2, unitPrice: "18000" },
      { name: "Stand", qty: 1, unitPrice: "2500.50" },
    ]);
    expect(r.lines.map((l) => l.lineTotal.toFixed(2))).toEqual(["36000.00", "2500.50"]);
    expect(r.total.toFixed(2)).toBe("38500.50");
    expect(r.productText).toBe("7 LTR WET GRINDER × 2, Stand");
  });
  it("rejects missing names, zero qty and negative prices", () => {
    expect(() => priceOrderItems([])).toThrow(/at least one item/);
    expect(() => priceOrderItems([{ name: " ", qty: 1, unitPrice: "1" }])).toThrow(/Item 1/);
    expect(() => priceOrderItems([{ name: "A", qty: 0, unitPrice: "1" }])).toThrow(/quantity/);
    expect(() => priceOrderItems([{ name: "A", qty: 1.5, unitPrice: "1" }])).toThrow(/quantity/);
    expect(() => priceOrderItems([{ name: "A", qty: 1, unitPrice: "-5" }])).toThrow(/price/);
  });
});
