// BR-04 / BR-05 — order and receipt number formatters.
import { describe, it, expect } from "vitest";
import {
  orderNumber,
  receiptNumber,
  orderCounterKey,
  receiptCounterKey,
} from "@/server/domain/order/numbering";

describe("orderNumber", () => {
  it("formats spec example KI/26-27/0042", () => {
    expect(orderNumber("KI", "26-27", 42)).toBe("KI/26-27/0042");
  });

  it("pads to 4 digits", () => {
    expect(orderNumber("KFM", "26-27", 1)).toBe("KFM/26-27/0001");
    expect(orderNumber("KI", "26-27", 1234)).toBe("KI/26-27/1234");
  });

  it("rejects invalid entity codes (lowercase or special chars)", () => {
    expect(() => orderNumber("ki", "26-27", 1)).toThrow();
    expect(() => orderNumber("K-I", "26-27", 1)).toThrow();
    expect(() => orderNumber("", "26-27", 1)).toThrow();
  });

  it("rejects invalid FY labels", () => {
    expect(() => orderNumber("KI", "2026-27", 1)).toThrow();
    expect(() => orderNumber("KI", "26/27", 1)).toThrow();
    expect(() => orderNumber("KI", "", 1)).toThrow();
  });

  it("rejects non-positive or non-integer sequences", () => {
    expect(() => orderNumber("KI", "26-27", 0)).toThrow();
    expect(() => orderNumber("KI", "26-27", -1)).toThrow();
    expect(() => orderNumber("KI", "26-27", 1.5)).toThrow();
  });

  it("rejects overflow beyond 4-digit range", () => {
    expect(() => orderNumber("KI", "26-27", 10000)).toThrow(/overflow/);
  });
});

describe("receiptNumber", () => {
  it("formats spec example RCPT/26-27/01231", () => {
    expect(receiptNumber("26-27", 1231)).toBe("RCPT/26-27/01231");
  });

  it("pads to 5 digits", () => {
    expect(receiptNumber("26-27", 1)).toBe("RCPT/26-27/00001");
    expect(receiptNumber("26-27", 99999)).toBe("RCPT/26-27/99999");
  });

  it("rejects overflow beyond 5-digit range", () => {
    expect(() => receiptNumber("26-27", 100000)).toThrow(/overflow/);
  });

  it("rejects invalid FY and sequence inputs", () => {
    expect(() => receiptNumber("27", 1)).toThrow();
    expect(() => receiptNumber("26-27", 0)).toThrow();
  });
});

describe("counter keys", () => {
  it("builds a stable key per entity+FY for orders", () => {
    expect(orderCounterKey("KI", "26-27")).toBe("ORDER:KI:26-27");
    expect(orderCounterKey("KFM", "26-27")).toBe("ORDER:KFM:26-27");
  });

  it("builds a stable key per FY for receipts", () => {
    expect(receiptCounterKey("26-27")).toBe("RCPT:26-27");
  });

  it("rejects malformed inputs", () => {
    expect(() => orderCounterKey("ki", "26-27")).toThrow();
    expect(() => receiptCounterKey("twenty-seven")).toThrow();
  });
});
