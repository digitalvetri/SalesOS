// Delivery follow-up (spec §6): pending orders grouped by promised delivery date.
import { describe, it, expect } from "vitest";
import { groupFollowUps, followUpBadge, type FollowUpItem } from "@/server/domain/dashboard/followUp";

const it_ = (id: string, d: string | null): FollowUpItem => ({
  id, deliveryDate: d, customer: id, productText: null, salesperson: "N", productionStatus: "NOT_STARTED",
});

describe("groupFollowUps", () => {
  it("buckets by delivery date relative to today", () => {
    expect(
      groupFollowUps([it_("a", "2026-10-10"), it_("b", "2026-10-15"), it_("c", "2026-10-20"), it_("d", "2026-11-30"), it_("e", null)], "2026-10-15"),
    ).toMatchObject({ overdue: [{ id: "a" }], today: [{ id: "b" }], week: [{ id: "c" }], later: [{ id: "d" }], noDate: [{ id: "e" }] });
  });

  it("week = 1..7 days ahead (8 days is later), across a month boundary", () => {
    const g = groupFollowUps([it_("d1", "2026-10-31"), it_("d7", "2026-11-06"), it_("d8", "2026-11-07"), it_("y", "2026-10-29")], "2026-10-30");
    expect(g.week.map((x) => x.id)).toEqual(["d1", "d7"]);
    expect(g.later.map((x) => x.id)).toEqual(["d8"]);
    expect(g.overdue.map((x) => x.id)).toEqual(["y"]);
  });

  it("sorts each group by date ascending (stable for equal dates)", () => {
    const g = groupFollowUps([it_("c", "2026-10-03"), it_("a", "2026-10-01"), it_("b", "2026-10-01"), it_("z", "2026-12-01"), it_("y", "2026-11-01")], "2026-10-15");
    expect(g.overdue.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(g.later.map((x) => x.id)).toEqual(["y", "z"]);
  });

  it("empty input → empty groups", () => {
    expect(groupFollowUps([], "2026-10-15")).toEqual({ overdue: [], today: [], week: [], later: [], noDate: [] });
  });
});

describe("followUpBadge", () => {
  it("describes how far the date is from today", () => {
    expect(followUpBadge("2026-10-12", "2026-10-15")).toBe("3 days late");
    expect(followUpBadge("2026-10-14", "2026-10-15")).toBe("1 day late");
    expect(followUpBadge("2026-10-15", "2026-10-15")).toBe("Today");
    expect(followUpBadge("2026-10-16", "2026-10-15")).toBe("Tomorrow");
    expect(followUpBadge("2026-10-20", "2026-10-15")).toBe("in 5 days");
    expect(followUpBadge(null, "2026-10-15")).toBe("No date");
  });
});
