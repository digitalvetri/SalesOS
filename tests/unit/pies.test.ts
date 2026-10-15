// Dashboard donuts (spec §6): status split, payment modes, sales by employee.
import { describe, it, expect } from "vitest";
import {
  statusSlices, slicesWithPercent, paymentModeSlices, employeeSlices, type Slice,
} from "@/server/domain/dashboard/pies";

describe("statusSlices", () => {
  it("drops zero slices, keeps the fixed order", () => {
    const s = statusSlices({ pending: 2, inProgress: 1, finished: 0, delivered: 1, cancelled: 0 });
    expect(s.map((x) => x.key)).toEqual(["pending", "inProgress", "delivered"]);
    expect(slicesWithPercent(s).reduce((a, x) => a + x.pct, 0)).toBe(100);
  });
  it("uses the agreed flat colours and labels", () => {
    const s = statusSlices({ pending: 1, inProgress: 1, finished: 1, delivered: 1, cancelled: 1 });
    expect(s.map((x) => x.color)).toEqual([
      "var(--color-warn-fill)", "#E0A526", "var(--color-accent)", "#2D2B2C", "var(--color-border-strong)",
    ]);
    expect(s.map((x) => x.label)).toEqual(["Pending", "On progress", "Finished", "Delivered", "Cancelled"]);
  });
  it("all zero → no slices", () => {
    expect(statusSlices({ pending: 0, inProgress: 0, finished: 0, delivered: 0, cancelled: 0 })).toEqual([]);
  });
});

describe("slicesWithPercent (largest remainder)", () => {
  const mk = (vals: number[]): Slice[] => vals.map((v, i) => ({ key: String(i), label: String(i), value: v, color: "#000" }));
  it("1/3 each → 34/33/33, sums to 100", () => {
    expect(slicesWithPercent(mk([1, 1, 1])).map((x) => x.pct)).toEqual([34, 33, 33]);
  });
  it("gives the extra point to the largest remainder", () => {
    // 66.67 / 33.33 → 67/33 ; 14.6 / 42.7 / 42.7 → 14/43/43
    expect(slicesWithPercent(mk([2, 1])).map((x) => x.pct)).toEqual([67, 33]);
    expect(slicesWithPercent(mk([146, 427, 427])).map((x) => x.pct)).toEqual([14, 43, 43]);
  });
  it("many tiny slices still sum to 100", () => {
    const p = slicesWithPercent(mk([997, 1, 1, 1])).map((x) => x.pct);
    expect(p.reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("empty / all-zero → pct 0, no crash", () => {
    expect(slicesWithPercent([])).toEqual([]);
    expect(slicesWithPercent(mk([0, 0])).map((x) => x.pct)).toEqual([0, 0]);
  });
});

describe("paymentModeSlices", () => {
  it("maps methods to labels (BANK_TRANSFER = Account), drops zero / negative, largest first", () => {
    const s = paymentModeSlices([
      { mode: "CASH", amount: "1000.50" },
      { mode: "BANK_TRANSFER", amount: "5000" },
      { mode: "UPI", amount: "2000" },
      { mode: "CHEQUE", amount: "0" },
      { mode: "CARD", amount: "-10" },
    ]);
    expect(s.map((x) => x.label)).toEqual(["Bank", "UPI", "Cash"]);
    expect(s[2]!.value).toBeCloseTo(1000.5);
    expect(new Set(s.map((x) => x.color)).size).toBe(3);
  });
});

describe("employeeSlices", () => {
  it("top 6 + Others, zero dropped", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G", "H"].map((n, i) => ({ name: n, value: String((8 - i) * 100) }));
    rows.push({ name: "Z", value: "0" });
    const s = employeeSlices(rows);
    expect(s.map((x) => x.label)).toEqual(["A", "B", "C", "D", "E", "F", "Others"]);
    expect(s[6]!.value).toBe(300); // G 200 + H 100
  });
  it("no Others slice when 6 or fewer", () => {
    expect(employeeSlices([{ name: "A", value: "5" }, { name: "B", value: "10" }]).map((x) => x.label)).toEqual(["B", "A"]);
  });
  it("palette has no purple / violet hues", () => {
    const rows = ["A", "B", "C", "D", "E", "F", "G"].map((n) => ({ name: n, value: "1" }));
    for (const c of employeeSlices(rows).map((x) => x.color)) {
      if (!c.startsWith("#")) continue;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as [number, number, number];
      expect(b > r && b > g && r > g).toBe(false); // purple-ish: blue dominant with red over green
    }
  });
});
