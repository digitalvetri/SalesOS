import { describe, it, expect } from "vitest";
import {
  dispatchStatusFor,
  applyDispatch,
  remainingPicks,
  isFullyDelivered,
  stuckInfo,
  boardColumnFor,
  pickGoldCard,
  DispatchRuleError,
  dispatchUpdateText,
} from "@/server/domain/dispatch/dispatch";

const lines = () => [
  { id: "a", qty: 17, dispatchedQty: 0 },
  { id: "b", qty: 2, dispatchedQty: 0 },
];

describe("dispatchStatusFor", () => {
  it("none / some / all", () => {
    expect(dispatchStatusFor(lines())).toBeNull();
    expect(dispatchStatusFor([{ id: "a", qty: 17, dispatchedQty: 5 }, { id: "b", qty: 2, dispatchedQty: 0 }])).toBe("PARTIALLY_DISPATCHED");
    expect(dispatchStatusFor([{ id: "a", qty: 17, dispatchedQty: 17 }, { id: "b", qty: 2, dispatchedQty: 2 }])).toBe("DISPATCHED");
  });
});

describe("applyDispatch (§5.3 partial by line + qty)", () => {
  it("partial then complete", () => {
    const first = applyDispatch(lines(), [{ orderLineId: "a", qty: 5 }]);
    expect(first.status).toBe("PARTIALLY_DISPATCHED");
    expect(first.dispatched.get("a")).toBe(5);
    const after = lines().map((l) => ({ ...l, dispatchedQty: first.dispatched.get(l.id)! }));
    const second = applyDispatch(after, remainingPicks(after));
    expect(second.status).toBe("DISPATCHED");
    expect([...second.dispatched.values()]).toEqual([17, 2]);
  });
  it("ignores zero picks but needs at least one", () => {
    expect(() => applyDispatch(lines(), [{ orderLineId: "a", qty: 0 }])).toThrow(DispatchRuleError);
    expect(applyDispatch(lines(), [{ orderLineId: "a", qty: 0 }, { orderLineId: "b", qty: 1 }]).status).toBe("PARTIALLY_DISPATCHED");
  });
  it("refuses over-dispatch, unknown lines, duplicates, fractions and negatives", () => {
    expect(() => applyDispatch(lines(), [{ orderLineId: "b", qty: 3 }])).toThrow(/Only 2 left/);
    expect(() => applyDispatch(lines(), [{ orderLineId: "zz", qty: 1 }])).toThrow(/not on this order/);
    expect(() => applyDispatch(lines(), [{ orderLineId: "a", qty: 1 }, { orderLineId: "a", qty: 1 }])).toThrow(/once per dispatch/);
    expect(() => applyDispatch(lines(), [{ orderLineId: "a", qty: 1.5 }])).toThrow(/whole numbers/);
    expect(() => applyDispatch(lines(), [{ orderLineId: "a", qty: -1 }])).toThrow(/whole numbers/);
  });
});

describe("isFullyDelivered", () => {
  const all = [{ id: "a", qty: 1, dispatchedQty: 1 }];
  it("needs everything shipped and every dispatch delivered", () => {
    expect(isFullyDelivered(all, [{ delivered: true }, { delivered: true }])).toBe(true);
    expect(isFullyDelivered(all, [{ delivered: true }, { delivered: false }])).toBe(false);
    expect(isFullyDelivered([{ id: "a", qty: 2, dispatchedQty: 1 }], [{ delivered: true }])).toBe(false);
    expect(isFullyDelivered(all, [])).toBe(false);
  });
});

describe("stuckInfo (§5.5)", () => {
  const today = "2026-10-20";
  it("CONFIRMED/IN_PRODUCTION older than the alert days is stuck", () => {
    expect(stuckInfo({ status: "IN_PRODUCTION", confirmedOn: "2026-10-09", promisedDeliveryDate: null }, today, 10)).toEqual({
      stuck: true, ageDays: 11, late: false, daysLate: 0,
    });
    expect(stuckInfo({ status: "CONFIRMED", confirmedOn: "2026-10-10", promisedDeliveryDate: null }, today, 10).stuck).toBe(false);
  });
  it("past the promised delivery date is stuck (until shipped)", () => {
    expect(stuckInfo({ status: "READY", confirmedOn: "2026-10-18", promisedDeliveryDate: "2026-10-15" }, today, 10)).toEqual({
      stuck: true, ageDays: 2, late: true, daysLate: 5,
    });
    expect(stuckInfo({ status: "PARTIALLY_DISPATCHED", confirmedOn: "2026-10-18", promisedDeliveryDate: "2026-10-15" }, today, 10).late).toBe(true);
    expect(stuckInfo({ status: "DISPATCHED", confirmedOn: "2026-09-01", promisedDeliveryDate: "2026-10-15" }, today, 10).stuck).toBe(false);
  });
  it("READY is not age-stuck; future confirmation dates clamp to 0", () => {
    expect(stuckInfo({ status: "READY", confirmedOn: "2026-09-01", promisedDeliveryDate: null }, today, 10).stuck).toBe(false);
    expect(stuckInfo({ status: "CONFIRMED", confirmedOn: "2026-10-25", promisedDeliveryDate: null }, today, 10).ageDays).toBe(0);
  });
});

describe("board", () => {
  it("maps statuses to the four columns", () => {
    expect(boardColumnFor("CONFIRMED")).toBe("CONFIRMED");
    expect(boardColumnFor("IN_PRODUCTION")).toBe("IN_PRODUCTION");
    expect(boardColumnFor("READY")).toBe("READY");
    expect(boardColumnFor("PARTIALLY_DISPATCHED")).toBe("READY");
    expect(boardColumnFor("DISPATCHED")).toBe("DISPATCHED");
    expect(boardColumnFor("DELIVERED")).toBeNull();
  });
  it("gold goes to the oldest stuck actionable card", () => {
    const cards = [
      { id: "1", stuck: false, ageDays: 30, column: "READY" as const },
      { id: "2", stuck: true, ageDays: 12, column: "CONFIRMED" as const },
      { id: "3", stuck: true, ageDays: 9, column: "IN_PRODUCTION" as const },
      { id: "4", stuck: true, ageDays: 40, column: "DISPATCHED" as const },
    ];
    expect(pickGoldCard(cards)).toBe("2");
  });
  it("falls back to the oldest actionable card, then any card, then none", () => {
    expect(pickGoldCard([
      { id: "1", stuck: false, ageDays: 3, column: "READY" as const },
      { id: "2", stuck: false, ageDays: 5, column: "CONFIRMED" as const },
    ])).toBe("2");
    expect(pickGoldCard([{ id: "9", stuck: false, ageDays: 1, column: "DISPATCHED" as const }])).toBe("9");
    expect(pickGoldCard([])).toBeNull();
  });
  it("ties break on id for a stable choice", () => {
    expect(pickGoldCard([
      { id: "b", stuck: false, ageDays: 5, column: "READY" as const },
      { id: "a", stuck: false, ageDays: 5, column: "READY" as const },
    ])).toBe("a");
  });
});

describe("dispatchUpdateText (§13 dispatch_update)", () => {
  it("with transporter + LR", () => {
    expect(
      dispatchUpdateText({ customerName: "Gokul", orderNumber: "KI/26-27/0412", items: [{ description: "15kg Potato Peeler", qty: 1 }], transporter: "ABT", lrNumber: "88213" }),
    ).toBe("Hi Gokul, your machines for KI/26-27/0412 have been dispatched via ABT, LR 88213: 15kg Potato Peeler ×1. Thank you!");
  });
  it("without transport details", () => {
    expect(dispatchUpdateText({ customerName: "Rew", orderNumber: "X/1", items: [{ description: "A", qty: 2 }, { description: "B", qty: 1 }] })).toBe(
      "Hi Rew, your machines for X/1 have been dispatched: A ×2, B ×1. Thank you!",
    );
  });
});
