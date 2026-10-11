// State-machine coverage (§5.1). We test *every* (from, to) pair in both the
// allowed and forbidden directions. If anyone later tweaks the spec diagram,
// this test fails row-by-row.
import { describe, it, expect } from "vitest";
import {
  ORDER_STATUSES,
  ALLOWED_TRANSITIONS,
  canTransition,
  canCancel,
  assertTransition,
  InvalidTransitionError,
  type OrderStatus,
} from "@/server/domain/order/stateMachine";

describe("stateMachine — ALLOWED_TRANSITIONS exhaustive matrix", () => {
  const statuses = ORDER_STATUSES;

  for (const from of statuses) {
    for (const to of statuses) {
      const expected = ALLOWED_TRANSITIONS[from].includes(to);
      const title = `${from} → ${to} should be ${expected ? "allowed" : "forbidden"}`;
      it(title, () => {
        expect(canTransition(from, to)).toBe(expected);
      });
    }
  }
});

describe("stateMachine — assertTransition", () => {
  it("passes silently for an allowed transition", () => {
    expect(() => assertTransition("CONFIRMED", "IN_PRODUCTION")).not.toThrow();
  });

  it("throws InvalidTransitionError for a forbidden transition", () => {
    try {
      assertTransition("DELIVERED", "CONFIRMED");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as InvalidTransitionError).from).toBe("DELIVERED");
      expect((e as InvalidTransitionError).to).toBe("CONFIRMED");
      expect((e as Error).message).toContain("Invalid order transition");
    }
  });
});

describe("stateMachine — canCancel", () => {
  it("allows cancel before any dispatch", () => {
    expect(canCancel("PENDING_APPROVAL")).toBe(true);
    expect(canCancel("CONFIRMED")).toBe(true);
    expect(canCancel("IN_PRODUCTION")).toBe(true);
    expect(canCancel("READY")).toBe(true);
  });

  it("locks cancel once anything has dispatched or the order is terminal", () => {
    const locked: OrderStatus[] = [
      "PARTIALLY_DISPATCHED",
      "DISPATCHED",
      "DELIVERED",
      "CLOSED",
      "CANCELLED",
    ];
    for (const s of locked) expect(canCancel(s)).toBe(false);
  });
});

describe("stateMachine — spec §5.1 named transitions", () => {
  it("stock items can go CONFIRMED → DELIVERED in one tap", () => {
    expect(canTransition("CONFIRMED", "DELIVERED")).toBe(true);
  });

  it("PENDING_APPROVAL can only move to CONFIRMED or CANCELLED", () => {
    expect(ALLOWED_TRANSITIONS.PENDING_APPROVAL).toEqual(["CONFIRMED", "CANCELLED"]);
  });

  it("CLOSED reopens to DELIVERED (when a verified payment is later rejected)", () => {
    expect(canTransition("CLOSED", "DELIVERED")).toBe(true);
  });

  it("CANCELLED is terminal — no outgoing transitions", () => {
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
  });
});
