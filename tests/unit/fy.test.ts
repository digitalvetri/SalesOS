// BR-03 — financial year helpers. Boundaries at Apr 1 00:00 IST.
import { describe, it, expect } from "vitest";
import { fyLabelOf, fyStart, fyEnd, istYearMonth } from "@/server/domain/fy";

// Helper: build a UTC date for a specific IST wall-clock moment.
// IST = UTC+5:30, so Apr 1 00:00 IST = Mar 31 18:30 UTC.
function istDate(y: number, m: number, d: number, hh = 0, mm = 0): Date {
  // Subtract 5:30 to get UTC.
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - (5 * 60 + 30) * 60 * 1000);
}

describe("fyLabelOf", () => {
  it("Apr 1 IST starts a new FY", () => {
    expect(fyLabelOf(istDate(2026, 4, 1, 0, 0))).toBe("26-27");
    expect(fyLabelOf(istDate(2027, 4, 1, 0, 0))).toBe("27-28");
  });

  it("Mar 31 IST is still in the previous FY", () => {
    expect(fyLabelOf(istDate(2027, 3, 31, 23, 59))).toBe("26-27");
    expect(fyLabelOf(istDate(2026, 3, 31, 23, 59))).toBe("25-26");
  });

  it("Oct 10 2026 IST is 26-27 (today in the spec)", () => {
    expect(fyLabelOf(istDate(2026, 10, 10, 12, 0))).toBe("26-27");
  });

  it("Jan–Mar is the previous calendar year's FY start", () => {
    expect(fyLabelOf(istDate(2027, 1, 15))).toBe("26-27");
    expect(fyLabelOf(istDate(2027, 2, 28))).toBe("26-27");
    expect(fyLabelOf(istDate(2027, 3, 15))).toBe("26-27");
  });
});

describe("istYearMonth", () => {
  it("returns IST year+month for a UTC date", () => {
    // UTC midnight → 05:30 IST same day
    const utc = new Date(Date.UTC(2026, 9, 10, 0, 0, 0));
    const r = istYearMonth(utc);
    expect(r.year).toBe(2026);
    expect(r.month).toBe(10);
  });

  it("rolls the IST date forward across UTC midnight late at night", () => {
    // UTC 20:00 → 01:30 IST next day
    const utc = new Date(Date.UTC(2026, 11, 31, 20, 0, 0)); // Dec 31 20:00 UTC
    const r = istYearMonth(utc);
    expect(r.year).toBe(2027);
    expect(r.month).toBe(1);
  });
});

describe("fyStart / fyEnd", () => {
  it("fyStart returns Apr 1 00:00 IST (as UTC) for a mid-FY date", () => {
    const anyDate = istDate(2026, 10, 10);
    const start = fyStart(anyDate);
    expect(start.toISOString()).toBe("2026-03-31T18:30:00.000Z"); // = Apr 1 00:00 IST
  });

  it("fyEnd returns Mar 31 23:59:59.999 IST (as UTC)", () => {
    const anyDate = istDate(2026, 10, 10);
    const end = fyEnd(anyDate);
    expect(end.toISOString()).toBe("2027-03-31T18:29:59.999Z"); // = Mar 31 23:59:59.999 IST
  });

  it("fyStart is strictly before fyEnd", () => {
    const d = istDate(2026, 7, 1);
    expect(fyStart(d).getTime()).toBeLessThan(fyEnd(d).getTime());
  });

  it("Date just before fyEnd still returns the same FY label", () => {
    const d = fyEnd(istDate(2026, 10, 10));
    expect(fyLabelOf(d)).toBe("26-27");
  });
});
