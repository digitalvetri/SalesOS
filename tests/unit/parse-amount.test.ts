// Spec §12.5: forgiving input — "29500", "29,500", "29.5k", "1.5l" all parse.
import { describe, it, expect } from "vitest";
import { parseAmount } from "@/lib/parseAmount";

describe("parseAmount", () => {
  it.each([
    ["29500", "29500"],
    ["29,500", "29500"],
    ["29.5k", "29500"],
    ["1.5l", "150000"],
    ["₹1,00,000", "100000"],
    ["  10000  ", "10000"],
    ["5K", "5000"], // case-insensitive
    ["2L", "200000"],
  ])("'%s' → %s", (input, expected) => {
    expect(parseAmount(input)!.toString()).toBe(expected);
  });

  it.each([["abc"], [""], ["--100"], ["10kl"], ["₹"]])(
    "'%s' → null",
    (input) => {
      expect(parseAmount(input)).toBeNull();
    },
  );

  it("preserves decimals", () => {
    expect(parseAmount("29.75")!.toString()).toBe("29.75");
  });
});
