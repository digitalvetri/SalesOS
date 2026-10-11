// BR-09 — exhaustive scenarios for the pure balance derivation.
import { describe, it, expect } from "vitest";
import {
  computeBalance,
  type PaymentForBalance,
  type OrderForBalance,
} from "@/server/domain/payment/balance";

const confirmed: OrderForBalance = { total: "100000", status: "CONFIRMED" };
const delivered: OrderForBalance = { total: "100000", status: "DELIVERED" };
const cancelled: OrderForBalance = { total: "100000", status: "CANCELLED" };
const closed: OrderForBalance = { total: "100000", status: "CLOSED" };

const p = (
  type: PaymentForBalance["type"],
  status: PaymentForBalance["status"],
  amount: string,
): PaymentForBalance => ({ type, status, amount });

describe("computeBalance — BR-09 §6", () => {
  it("empty payments ⇒ balance = total", () => {
    const r = computeBalance(confirmed, []);
    expect(r.balanceDue.toString()).toBe("100000");
    expect(r.netReceived.toString()).toBe("0");
    expect(r.isRefundDue).toBe(false);
    expect(r.shouldClose).toBe(false);
    expect(r.shouldReopen).toBe(false);
  });

  it("one PENDING advance counts toward netReceived", () => {
    const r = computeBalance(confirmed, [p("ADVANCE", "PENDING_VERIFICATION", "20000")]);
    expect(r.netReceived.toString()).toBe("20000");
    expect(r.verifiedNet.toString()).toBe("0");
    expect(r.balanceDue.toString()).toBe("80000");
  });

  it("one VERIFIED advance counts toward both", () => {
    const r = computeBalance(confirmed, [p("ADVANCE", "VERIFIED", "20000")]);
    expect(r.netReceived.toString()).toBe("20000");
    expect(r.verifiedNet.toString()).toBe("20000");
    expect(r.balanceDue.toString()).toBe("80000");
  });

  it("REJECTED payments do not count", () => {
    const r = computeBalance(confirmed, [
      p("ADVANCE", "VERIFIED", "20000"),
      p("PART", "REJECTED", "50000"),
    ]);
    expect(r.netReceived.toString()).toBe("20000");
    expect(r.balanceDue.toString()).toBe("80000");
  });

  it("REFUND reduces netReceived", () => {
    const r = computeBalance(confirmed, [
      p("ADVANCE", "VERIFIED", "20000"),
      p("REFUND", "VERIFIED", "5000"),
    ]);
    expect(r.netReceived.toString()).toBe("15000");
    expect(r.balanceDue.toString()).toBe("85000");
  });

  it("CANCELLED order treats effectiveTotal as 0 (refund-due visible)", () => {
    const r = computeBalance(cancelled, [p("ADVANCE", "VERIFIED", "20000")]);
    expect(r.balanceDue.toString()).toBe("-20000");
    expect(r.isRefundDue).toBe(true);
  });

  it("CANCELLED with refund already issued ⇒ balance 0", () => {
    const r = computeBalance(cancelled, [
      p("ADVANCE", "VERIFIED", "20000"),
      p("REFUND", "VERIFIED", "20000"),
    ]);
    expect(r.balanceDue.toString()).toBe("0");
    expect(r.isRefundDue).toBe(false);
  });

  it("DELIVERED with verified balance zero ⇒ shouldClose", () => {
    const r = computeBalance(delivered, [
      p("ADVANCE", "VERIFIED", "40000"),
      p("FINAL", "VERIFIED", "60000"),
    ]);
    expect(r.verifiedNet.toString()).toBe("100000");
    expect(r.shouldClose).toBe(true);
    expect(r.shouldReopen).toBe(false);
  });

  it("DELIVERED with pending-only payments does NOT shouldClose", () => {
    const r = computeBalance(delivered, [
      p("ADVANCE", "PENDING_VERIFICATION", "40000"),
      p("FINAL", "PENDING_VERIFICATION", "60000"),
    ]);
    expect(r.balanceDue.toString()).toBe("0"); // customer-side balance uses pending
    expect(r.verifiedNet.toString()).toBe("0");
    expect(r.shouldClose).toBe(false); // CLOSED requires VERIFIED-only balance zero
  });

  it("CLOSED order with a rejected payment reopens", () => {
    const r = computeBalance(closed, [
      p("ADVANCE", "VERIFIED", "40000"),
      p("FINAL", "VERIFIED", "60000"),
      p("PART", "REJECTED", "10000"), // doesn't affect
    ]);
    expect(r.verifiedNet.toString()).toBe("100000");
    expect(r.shouldReopen).toBe(false);
    // Now imagine FINAL became rejected:
    const r2 = computeBalance(closed, [
      p("ADVANCE", "VERIFIED", "40000"),
      p("FINAL", "REJECTED", "60000"),
    ]);
    expect(r2.verifiedNet.toString()).toBe("40000");
    expect(r2.shouldReopen).toBe(true);
    expect(r2.shouldClose).toBe(false);
  });

  it("rounds to paise half-up", () => {
    const r = computeBalance(
      { total: "100.333", status: "CONFIRMED" },
      [p("ADVANCE", "VERIFIED", "50.111")],
    );
    expect(r.balanceDue.toString()).toBe("50.22");
  });
});
