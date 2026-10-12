import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { computeBalance, isFullyPaid, applyPayment } from "@/server/domain/v1_1/balance";

describe("v1.1 computeBalance", () => {
  it("total − paidTotal when > 0", () => {
    expect(computeBalance("100000", "20000").toString()).toBe("80000");
  });
  it("clamps to 0 when fully paid", () => {
    expect(computeBalance("100000", "100000").toString()).toBe("0");
  });
  it("clamps to 0 on overpayment (never negative)", () => {
    expect(computeBalance("100000", "120000").toString()).toBe("0");
  });
  it("handles paise correctly", () => {
    expect(computeBalance("62500.50", "20000.25").toString()).toBe("42500.25");
  });
  it("accepts number and Decimal inputs", () => {
    expect(computeBalance(100, 25).toString()).toBe("75");
    expect(computeBalance(new Decimal("50.00"), new Decimal("30.00")).toString()).toBe("20");
  });
});

describe("v1.1 isFullyPaid", () => {
  it("true when balance is zero", () => {
    expect(isFullyPaid("1000", "1000")).toBe(true);
  });
  it("true when overpaid (clamped)", () => {
    expect(isFullyPaid("1000", "1500")).toBe(true);
  });
  it("false when balance > 0", () => {
    expect(isFullyPaid("1000", "999.99")).toBe(false);
  });
});

describe("v1.1 applyPayment", () => {
  it("partial payment reduces balance", () => {
    const r = applyPayment("100000", "0", "25000");
    expect(r.newPaidTotal.toString()).toBe("25000");
    expect(r.newBalance.toString()).toBe("75000");
    expect(r.overpayment.toString()).toBe("0");
  });
  it("exact payment zeroes the balance", () => {
    const r = applyPayment("100000", "40000", "60000");
    expect(r.newPaidTotal.toString()).toBe("100000");
    expect(r.newBalance.toString()).toBe("0");
    expect(r.overpayment.toString()).toBe("0");
  });
  it("overpayment caps paid at total and reports overpayment", () => {
    const r = applyPayment("100000", "80000", "30000");
    expect(r.newPaidTotal.toString()).toBe("100000");
    expect(r.newBalance.toString()).toBe("0");
    expect(r.overpayment.toString()).toBe("10000");
  });
  it("rejects negative payment", () => {
    expect(() => applyPayment("100", "0", "-10")).toThrow();
  });
});
