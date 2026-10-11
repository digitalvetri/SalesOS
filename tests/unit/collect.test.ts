import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  overdueInfo,
  matchesFilter,
  reminderAvailableAt,
  reminderText,
  waLink,
  REMINDER_COOLDOWN_MS,
} from "@/server/domain/payment/collect";

const TODAY = "2026-10-20";

describe("date helpers", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("counts days", () => {
    expect(daysBetween("2026-10-02", TODAY)).toBe(18);
  });
});

describe("overdueInfo (§5.4)", () => {
  it("promised date in the past ⇒ overdue by the gap", () => {
    expect(overdueInfo({ balanceDue: "14000", promisedPaymentDate: "2026-10-02", deliveredOn: null }, TODAY, 7)).toEqual({
      overdue: true,
      daysOverdue: 18,
      dueOn: "2026-10-02",
    });
  });
  it("promised today or later ⇒ not overdue", () => {
    expect(overdueInfo({ balanceDue: "1", promisedPaymentDate: TODAY, deliveredOn: null }, TODAY, 7).overdue).toBe(false);
    expect(overdueInfo({ balanceDue: "1", promisedPaymentDate: "2026-10-25", deliveredOn: "2026-01-01" }, TODAY, 7)).toEqual({
      overdue: false,
      daysOverdue: 0,
      dueOn: "2026-10-25",
    });
  });
  it("no promise: overdue once delivery + grace has passed", () => {
    expect(overdueInfo({ balanceDue: "1", promisedPaymentDate: null, deliveredOn: "2026-10-13" }, TODAY, 7).overdue).toBe(false);
    expect(overdueInfo({ balanceDue: "1", promisedPaymentDate: null, deliveredOn: "2026-10-12" }, TODAY, 7)).toEqual({
      overdue: true,
      daysOverdue: 1,
      dueOn: "2026-10-19",
    });
  });
  it("no promise and not delivered ⇒ never overdue", () => {
    expect(overdueInfo({ balanceDue: "5000", promisedPaymentDate: null, deliveredOn: null }, TODAY, 7)).toEqual({
      overdue: false,
      daysOverdue: 0,
      dueOn: null,
    });
  });
  it("nothing due ⇒ not overdue", () => {
    expect(overdueInfo({ balanceDue: "0", promisedPaymentDate: "2026-01-01", deliveredOn: null }, TODAY, 7).overdue).toBe(false);
  });
});

describe("matchesFilter", () => {
  const row = (promisedPaymentDate: string | null, overdue = false) => ({ promisedPaymentDate, overdue });
  it("all", () => expect(matchesFilter("all", row(null), TODAY)).toBe(true));
  it("overdue", () => {
    expect(matchesFilter("overdue", row(null, true), TODAY)).toBe(true);
    expect(matchesFilter("overdue", row(null), TODAY)).toBe(false);
  });
  it("promised today", () => {
    expect(matchesFilter("today", row(TODAY), TODAY)).toBe(true);
    expect(matchesFilter("today", row("2026-10-21"), TODAY)).toBe(false);
  });
  it("this week = today .. today+6", () => {
    expect(matchesFilter("week", row(TODAY), TODAY)).toBe(true);
    expect(matchesFilter("week", row("2026-10-26"), TODAY)).toBe(true);
    expect(matchesFilter("week", row("2026-10-27"), TODAY)).toBe(false);
    expect(matchesFilter("week", row("2026-10-19"), TODAY)).toBe(false);
    expect(matchesFilter("week", row(null), TODAY)).toBe(false);
  });
  it("unknown filter falls back to all", () => {
    expect(matchesFilter("bogus" as never, row(null), TODAY)).toBe(true);
  });
});

describe("reminder cooldown (§13: 1 per order per 48 h)", () => {
  const now = new Date("2026-10-20T10:00:00Z");
  it("free when never reminded or after 48 h", () => {
    expect(reminderAvailableAt(null, now)).toBeNull();
    expect(reminderAvailableAt(new Date(now.getTime() - REMINDER_COOLDOWN_MS), now)).toBeNull();
  });
  it("blocked within 48 h, reports when it frees up", () => {
    const last = new Date("2026-10-19T10:00:00Z");
    expect(reminderAvailableAt(last, now)).toEqual(new Date("2026-10-21T10:00:00Z"));
  });
});

describe("reminder text + link", () => {
  it("single order", () => {
    expect(reminderText({ customerName: "Gokul", orders: [{ number: "KI/26-27/0412", balanceDue: "14000" }] })).toBe(
      "Hi Gokul, gentle reminder: ₹14,000 is pending for KI/26-27/0412. Thank you.",
    );
  });
  it("several orders + entity", () => {
    const text = reminderText({
      customerName: "Rew",
      entityName: "Kumaar Industries",
      orders: [
        { number: "KI/26-27/0001", balanceDue: "10000" },
        { number: "KI/26-27/0002", balanceDue: "17010" },
      ],
    });
    expect(text).toContain("₹27,010 is pending across 2 orders");
    expect(text).toContain("KI/26-27/0002 (₹17,010)");
    expect(text.endsWith("Thank you — Kumaar Industries.")).toBe(true);
  });
  it("wa.me link strips + and encodes text", () => {
    expect(waLink("+919843722055", "a b&c")).toBe("https://wa.me/919843722055?text=a%20b%26c");
  });
});
