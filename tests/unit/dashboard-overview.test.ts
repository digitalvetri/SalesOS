import { describe, it, expect } from "vitest";
import {
  averageOrderValue,
  dateOnly,
  daysSince,
  deltaPct,
  displayCustomerName,
  formatOrderDate,
  hasTarget,
  lastOrderChip,
  monthWindow,
  orderDayLabel,
  paceToday,
  paceVerdict,
  sortTargetRows,
  teamTotals,
  ymdOf,
} from "@/server/domain/dashboard/overview";

const sheet = (customer: string | null) => ({ sheet: "VIJI", rows: [142], customer });

describe("date-column bounds", () => {
  it("dateOnly / ymdOf are UTC-midnight round trips", () => {
    expect(dateOnly("2026-10-01").toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(ymdOf(dateOnly("2026-02-28"))).toBe("2026-02-28");
  });
});

describe("monthWindow (IST)", () => {
  it("13 Oct 2026 IST → October, prev = 1–13 Sep", () => {
    const w = monthWindow(new Date("2026-10-13T10:00:00Z"));
    expect(w).toEqual({
      today: "2026-10-13",
      ym: "2026-10",
      monthStart: "2026-10-01",
      nextMonthStart: "2026-11-01",
      dayOfMonth: 13,
      daysInMonth: 31,
      daysLeft: 18,
      prevYm: "2026-09",
      prevStart: "2026-09-01",
      prevSameDayEnd: "2026-09-14",
    });
  });
  it("uses the IST date, not the UTC date, near midnight", () => {
    // 31 Oct 19:00 UTC = 1 Nov 00:30 IST
    const w = monthWindow(new Date("2026-10-31T19:00:00Z"));
    expect(w.ym).toBe("2026-11");
    expect(w.monthStart).toBe("2026-11-01");
    expect(w.prevStart).toBe("2026-10-01");
    expect(w.prevSameDayEnd).toBe("2026-10-02");
  });
  it("clamps the previous-month window to its length (31 Mar → all of Feb)", () => {
    const w = monthWindow(new Date("2027-03-31T06:00:00Z"));
    expect(w.prevStart).toBe("2027-02-01");
    expect(w.prevSameDayEnd).toBe("2027-03-01");
    expect(w.daysLeft).toBe(0);
  });
  it("crosses the year boundary", () => {
    const w = monthWindow(new Date("2027-01-05T06:00:00Z"));
    expect(w.prevYm).toBe("2026-12");
    expect(w.nextMonthStart).toBe("2027-02-01");
  });
  it("pace = share of the month elapsed", () => {
    expect(paceToday({ dayOfMonth: 13, daysInMonth: 31 })).toBe(42);
    expect(paceToday({ dayOfMonth: 30, daysInMonth: 30 })).toBe(100);
  });
});

describe("day labels", () => {
  it("daysSince never goes negative", () => {
    expect(daysSince("2026-09-28", "2026-10-13")).toBe(15);
    expect(daysSince("2026-10-14", "2026-10-13")).toBe(0);
  });
  it("orderDayLabel", () => {
    expect(orderDayLabel("2026-10-13", "2026-10-13")).toBe("today");
    expect(orderDayLabel("2026-10-12", "2026-10-13")).toBe("yesterday");
    expect(orderDayLabel("2026-10-10", "2026-10-13")).toBe("3 days ago");
    expect(orderDayLabel("2026-09-12", "2026-10-13")).toBe("12 Sept");
  });
  it("lastOrderChip", () => {
    expect(lastOrderChip(null, "2026-10-13")).toBeNull();
    expect(lastOrderChip("2026-10-13", "2026-10-13")).toBe("last order today");
    expect(lastOrderChip("2026-10-12", "2026-10-13")).toBe("last order yesterday");
    expect(lastOrderChip("2026-10-03", "2026-10-13")).toBe("no order in 10 days");
  });
  it("formatOrderDate adds the year only when it differs from today's", () => {
    expect(formatOrderDate("2026-10-12")).toBe("12 Oct");
    expect(formatOrderDate("2026-10-12", "2026-10-13")).toBe("12 Oct");
    expect(formatOrderDate("2025-12-30", "2026-10-13")).toBe("30 Dec 2025");
  });
});

describe("displayCustomerName", () => {
  it("prefers the sheet's customer name for imported orders", () => {
    expect(displayCustomerName(sheet("Ravi Traders"), "DEALER NAME")).toBe("Ravi Traders");
  });
  it("falls back to the customer record, then to an em dash", () => {
    expect(displayCustomerName(sheet("  "), "KUMAR")).toBe("KUMAR");
    expect(displayCustomerName(sheet(null), "KUMAR")).toBe("KUMAR");
    expect(displayCustomerName(null, "KUMAR")).toBe("KUMAR");
    expect(displayCustomerName({ unrelated: true }, " ")).toBe("—");
    expect(displayCustomerName(null, null)).toBe("—");
  });
});

describe("deltaPct", () => {
  it("no comparison when the previous figure is 0", () => {
    expect(deltaPct("0", "0")).toBeNull();
    expect(deltaPct("5000", 0)).toBeNull();
  });
  it("rounds to whole percent, both directions", () => {
    expect(deltaPct("150", "100")).toBe(50);
    expect(deltaPct(2, 3)).toBe(-33);
    expect(deltaPct("0", "100")).toBe(-100);
  });
});

describe("targets", () => {
  it("hasTarget: only positive amounts count", () => {
    expect(hasTarget("100000")).toBe(true);
    expect(hasTarget("0")).toBe(false);
    expect(hasTarget("0.00")).toBe(false);
    expect(hasTarget(null)).toBe(false);
    expect(hasTarget(undefined)).toBe(false);
  });
  it("paceVerdict: no target → no verdict", () => {
    expect(paceVerdict(null, 42)).toBe("none");
    expect(paceVerdict(100, 42)).toBe("achieved");
    expect(paceVerdict(30, 42)).toBe("behind"); // < 85% of 42 = 35.7
    expect(paceVerdict(36, 42)).toBe("on_pace");
  });
  it("sortTargetRows: targeted by % first, then no-target by sales", () => {
    const rows = [
      { name: "A", pct: null, achieved: "100" },
      { name: "B", pct: 40, achieved: "40" },
      { name: "C", pct: null, achieved: "900" },
      { name: "D", pct: 90, achieved: "90" },
      { name: "E", pct: 90, achieved: "9" },
      { name: "F", pct: null, achieved: "100" },
    ];
    expect(sortTargetRows(rows).map((r) => r.name)).toEqual(["D", "E", "B", "C", "A", "F"]);
  });
  it("teamTotals sums only real targets", () => {
    const t = teamTotals([
      { achieved: "60000", target: "100000" },
      { achieved: "403801", target: "0" },
      { achieved: "40000", target: "100000" },
    ]);
    expect(t).toEqual({
      achieved: "503801",
      target: "200000",
      achievedOfTargeted: "100000",
      withTarget: 2,
      pct: 50,
    });
  });
  it("teamTotals with no targets has no %", () => {
    expect(teamTotals([{ achieved: "5", target: "0" }]).pct).toBeNull();
    expect(teamTotals([]).withTarget).toBe(0);
  });
});

describe("averageOrderValue", () => {
  it("divides by priced orders only; 0 when none", () => {
    expect(averageOrderValue("300000", 3)).toBe("100000");
    expect(averageOrderValue("100", 3)).toBe("33");
    expect(averageOrderValue("0", 0)).toBe("0");
  });
});
