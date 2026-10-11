import { describe, it, expect } from "vitest";
import { achievedPct, overTarget, amountToReachTarget } from "@/server/domain/v1_1/achieved";

describe("v1.1 achievedPct", () => {
  it("rounds to whole %", () => {
    expect(achievedPct("1400000", "2000000")).toBe(70);
    expect(achievedPct("1420500", "2000000")).toBe(71); // 71.025 → 71
    expect(achievedPct("1425000", "2000000")).toBe(71); // 71.25 → 71
    expect(achievedPct("1430000", "2000000")).toBe(72); // 71.5 → 72 (half-up)
  });
  it("over 100% is reported honestly (not clamped)", () => {
    expect(achievedPct("4200000", "3000000")).toBe(140);
  });
  it("target 0 → null (no target)", () => {
    expect(achievedPct("1000000", "0")).toBeNull();
  });
  it("target negative → null (treated as 'no target')", () => {
    expect(achievedPct("1000", "-1")).toBeNull();
  });
  it("achieved 0 → 0%", () => {
    expect(achievedPct("0", "100000")).toBe(0);
  });
});

describe("v1.1 overTarget", () => {
  it("true at exactly 100%", () => {
    expect(overTarget("1000", "1000")).toBe(true);
  });
  it("false just under", () => {
    expect(overTarget("999", "1000")).toBe(false); // 99.9% → rounds to 100? no, rounds down
  });
  it("false when no target", () => {
    expect(overTarget("1000", "0")).toBe(false);
  });
});

describe("v1.1 amountToReachTarget", () => {
  it("returns the gap when under target", () => {
    expect(amountToReachTarget("1400000", "2000000").toString()).toBe("600000");
  });
  it("returns 0 when at or over target", () => {
    expect(amountToReachTarget("2500000", "2000000").toString()).toBe("0");
  });
  it("returns 0 when no target is set", () => {
    expect(amountToReachTarget("500000", "0").toString()).toBe("0");
  });
});
