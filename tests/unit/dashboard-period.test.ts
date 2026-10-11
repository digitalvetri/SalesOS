import { describe, it, expect } from "vitest";
import { resolvePeriod, previousPeriod, pctChange, agingBucket, last12Months } from "@/server/domain/dashboard/period";

const now = new Date("2026-10-20T10:00:00Z"); // 20 Oct IST

describe("resolvePeriod", () => {
  it("defaults to this month (IST)", () => {
    expect(resolvePeriod(undefined, now)).toEqual({ key: "this_month", from: "2026-10-01", to: "2026-10-20" });
    expect(resolvePeriod(undefined, new Date("2026-10-31T19:00:00Z")).from).toBe("2026-11-01"); // already Nov in IST
  });
  it("last month, FY (April start), last 30 days", () => {
    expect(resolvePeriod("last_month", now)).toEqual({ key: "last_month", from: "2026-09-01", to: "2026-09-30" });
    expect(resolvePeriod("this_fy", now)).toEqual({ key: "this_fy", from: "2026-04-01", to: "2026-10-20" });
    expect(resolvePeriod("this_fy", new Date("2027-02-10T00:00:00Z")).from).toBe("2026-04-01");
    expect(resolvePeriod("last_30", now)).toEqual({ key: "last_30", from: "2026-09-21", to: "2026-10-20" });
  });
  it("handles February and year boundaries", () => {
    expect(resolvePeriod("last_month", new Date("2027-03-05T00:00:00Z"))).toMatchObject({ from: "2027-02-01", to: "2027-02-28" });
    expect(resolvePeriod("last_month", new Date("2027-01-05T00:00:00Z"))).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("previousPeriod", () => {
  it("month → whole previous month", () => {
    expect(previousPeriod(resolvePeriod("this_month", now))).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousPeriod(resolvePeriod("last_month", now))).toEqual({ from: "2026-08-01", to: "2026-08-31" });
  });
  it("rolling windows → same length just before", () => {
    expect(previousPeriod(resolvePeriod("last_30", now))).toEqual({ from: "2026-08-22", to: "2026-09-20" });
  });
});

describe("pctChange / agingBucket / last12Months", () => {
  it("pct", () => {
    expect(pctChange(112, 100)).toBe(12);
    expect(pctChange(80, 100)).toBe(-20);
    expect(pctChange(5, 0)).toBeNull();
  });
  it("aging buckets", () => {
    expect([0, 15, 16, 30, 31, 60, 61].map(agingBucket)).toEqual(["0-15", "0-15", "16-30", "16-30", "31-60", "31-60", "60+"]);
  });
  it("12 months oldest first", () => {
    const m = last12Months("2026-10-20");
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2025-11");
    expect(m[11]).toBe("2026-10");
  });
});
