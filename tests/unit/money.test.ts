// money.ts — thin Decimal.js wrappers used across services.
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  dec,
  roundToPaise,
  sum,
  mul,
  sub,
  eq,
  isPositive,
  isNonNegative,
  toDbString,
} from "@/server/domain/money";

describe("dec", () => {
  it("wraps strings, numbers, and Decimals", () => {
    expect(dec(1).toString()).toBe("1");
    expect(dec("1.50").toString()).toBe("1.5");
    expect(dec(new Decimal(2)).toString()).toBe("2");
  });
});

describe("roundToPaise", () => {
  it("rounds half-up to 2 decimals", () => {
    expect(roundToPaise("0.005").toString()).toBe("0.01");
    expect(roundToPaise("0.004").toString()).toBe("0");
    expect(roundToPaise("1000.555").toString()).toBe("1000.56");
  });

  it("leaves integers unchanged", () => {
    expect(roundToPaise("1000").toString()).toBe("1000");
  });
});

describe("sum / mul / sub", () => {
  it("sum adds iterables of mixed types", () => {
    expect(sum([1, "2", new Decimal(3)]).toString()).toBe("6");
    expect(sum([]).toString()).toBe("0");
  });

  it("mul multiplies two Decimal.Values", () => {
    expect(mul("1.5", 2).toString()).toBe("3");
  });

  it("sub subtracts", () => {
    expect(sub(10, "3").toString()).toBe("7");
  });
});

describe("eq / isPositive / isNonNegative", () => {
  it("eq compares values regardless of representation", () => {
    expect(eq("1.50", 1.5)).toBe(true);
    expect(eq(1, 2)).toBe(false);
  });

  it("isPositive is strict", () => {
    expect(isPositive(1)).toBe(true);
    expect(isPositive(0)).toBe(false);
    expect(isPositive(-1)).toBe(false);
  });

  it("isNonNegative accepts zero", () => {
    expect(isNonNegative(0)).toBe(true);
    expect(isNonNegative(1)).toBe(true);
    expect(isNonNegative(-1)).toBe(false);
  });
});

describe("toDbString", () => {
  it("formats rounded value as string for Decimal columns", () => {
    expect(toDbString("1000.555")).toBe("1000.56");
    expect(toDbString("1000.004")).toBe("1000");
  });
});
