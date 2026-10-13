import { describe, it, expect } from "vitest";
import {
  realPhone,
  displayPhone,
  customerLabelOf,
  contactLabelOf,
  telOf,
  amountMissing,
  groupByMonth,
  summarise,
} from "@/lib/orderDisplay";

const sheet = (customer: string | null, contact: string | null) => ({ customer, contact });

describe("phones", () => {
  it("treats import placeholders as no phone", () => {
    expect(realPhone("+91-import-VIJIR519")).toBeNull();
    expect(realPhone(null)).toBeNull();
    expect(realPhone("+919965736331")).toBe("+919965736331");
    expect(displayPhone("+919965736331")).toBe("9965736331");
    expect(displayPhone("+971501234567")).toBe("+971501234567");
  });
});

describe("labels", () => {
  it("prefers the sheet row for imported orders", () => {
    expect(customerLabelOf(sheet("Ravi Bakery", "9965736331 / 8122774418"), "Dealer Co")).toBe("Ravi Bakery");
    expect(customerLabelOf(sheet(null, null), "Dealer Co")).toBe("—");
    expect(customerLabelOf(null, "")).toBe("—");
    expect(customerLabelOf(null, "Asha")).toBe("Asha");
    // Viji: phone under CUSTOMER, name under CONTACT → the cleaned name.
    expect(customerLabelOf({ ...sheet("9562229999", "BENNY"), name: "BENNY" } as never, "")).toBe("BENNY");
    expect(customerLabelOf({ ...sheet("9207564091", null), name: null } as never, "x")).toBe("—");
    expect(contactLabelOf(sheet("x", "9965736331 / 8122774418"), "+919000000000")).toBe("9965736331 / 8122774418");
    expect(contactLabelOf(sheet("x", null), "+919000000000")).toBe("9000000000");
    expect(contactLabelOf(null, "+91-import-X")).toBe("—");
    expect(telOf(sheet("x", "9965736331 / 8122774418"), null)).toBe("+919965736331");
    expect(telOf(sheet("x", "call later"), null)).toBeNull();
    expect(telOf(sheet("x", "9965736331 8122774418"), null)).toBe("+919965736331");
  });
});

describe("amounts", () => {
  it("blanks only while the total is still missing", () => {
    expect(amountMissing({ totalMissing: true, total: "0" })).toBe(true);
    expect(amountMissing({ totalMissing: true, total: "5000" })).toBe(false);
    expect(amountMissing({ totalMissing: false, total: "0" })).toBe(false);
  });

  it("summarises without cancelled or blank-total orders", () => {
    const base = { totalMissing: false, total: "100.50", paidTotal: "50", balanceDue: "50.50", simpleStatus: "PENDING" };
    const s = summarise([
      base,
      { ...base, simpleStatus: "CANCELLED" },
      { ...base, totalMissing: true, total: "0", paidTotal: "0", balanceDue: "0" },
      { ...base, total: "0.20", paidTotal: "0.10", balanceDue: "0.10" },
    ]);
    expect(s).toEqual({ orders: 3, cancelled: 1, noAmount: 1, total: 100.7, paid: 50.1, balance: 50.6 });
  });
});

describe("groupByMonth", () => {
  it("newest month first, dates ascending inside a month (IST)", () => {
    const d = (iso: string) => new Date(iso);
    const g = groupByMonth([
      { id: "a", orderDate: d("2026-09-30T00:00:00Z"), serialNo: 5 },
      { id: "b", orderDate: d("2026-10-02T00:00:00Z"), serialNo: 7 },
      { id: "c", orderDate: d("2026-10-01T00:00:00Z"), serialNo: 6 },
      // 31 Oct 20:00 UTC is 1 Nov in IST
      { id: "d", orderDate: d("2026-10-31T20:00:00Z"), serialNo: 8 },
    ]);
    expect(g.map((x) => [x.month, x.rows.map((r) => r.id)])).toEqual([
      ["2026-11", ["d"]],
      ["2026-10", ["c", "b"]],
      ["2026-09", ["a"]],
    ]);
  });
});
