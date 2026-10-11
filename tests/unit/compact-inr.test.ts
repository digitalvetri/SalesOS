import { describe, it, expect } from "vitest";
import { compactInr, niceTicks } from "@/lib/compactInr";

describe("compactInr", () => {
  it("uses Indian units", () => {
    expect(compactInr(0)).toBe("₹0");
    expect(compactInr(950)).toBe("₹950");
    expect(compactInr(50000)).toBe("₹50K");
    expect(compactInr(150000)).toBe("₹1.5L");
    expect(compactInr(1800000)).toBe("₹18L");
    expect(compactInr(12000000)).toBe("₹1.2Cr");
    expect(compactInr(-2500)).toBe("−₹2.5K");
  });
});

describe("niceTicks", () => {
  it("covers the max with clean steps", () => {
    expect(niceTicks(0)).toEqual([0]);
    expect(niceTicks(130000)).toEqual([0, 50000, 100000, 150000]);
    expect(niceTicks(1892400)).toEqual([0, 1000000, 2000000]);
  });
});
