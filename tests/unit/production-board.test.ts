import { describe, expect, it } from "vitest";
import { deliveryBadge, istDayKey } from "@/app/(app)/production/deliveryBadge";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`); // @db.Date shape

describe("istDayKey", () => {
  it("uses the IST calendar day", () => {
    expect(istDayKey(new Date("2026-10-15T18:29:00Z"))).toBe("2026-10-15"); // 23:59 IST
    expect(istDayKey(new Date("2026-10-15T18:31:00Z"))).toBe("2026-10-16"); // 00:01 IST next day
  });
});

describe("deliveryBadge", () => {
  const today = "2026-10-15";
  it("no date", () => {
    expect(deliveryBadge(null, today)).toEqual({ label: "No date", tone: "none", days: null });
  });
  it("overdue", () => {
    expect(deliveryBadge(d("2026-10-14"), today)).toMatchObject({ label: "Overdue 1 day", tone: "overdue" });
    expect(deliveryBadge(d("2026-10-05"), today)).toMatchObject({ label: "Overdue 10 days", tone: "overdue", days: -10 });
  });
  it("today / tomorrow / in N days", () => {
    expect(deliveryBadge(d("2026-10-15"), today)).toMatchObject({ label: "Today", tone: "today" });
    expect(deliveryBadge(d("2026-10-16"), today)).toMatchObject({ label: "Tomorrow", tone: "soon" });
    expect(deliveryBadge(d("2026-10-20"), today)).toMatchObject({ label: "in 5 days", tone: "soon" });
    expect(deliveryBadge(d("2026-11-15"), today)).toMatchObject({ label: "in 31 days", tone: "later" });
  });
  it("crosses month and year boundaries", () => {
    expect(deliveryBadge(d("2027-01-01"), "2026-12-31")).toMatchObject({ label: "Tomorrow" });
    expect(deliveryBadge(d("2026-09-30"), "2026-10-01")).toMatchObject({ label: "Overdue 1 day" });
  });
});
