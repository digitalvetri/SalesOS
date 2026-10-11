import { describe, it, expect } from "vitest";
import { parseAmount } from "@/server/domain/v1_1/amountParser";

describe("v1.1 parseAmount", () => {
  it("plain integer", () => {
    expect(parseAmount("62500")?.toString()).toBe("62500");
  });
  it("Indian comma grouping", () => {
    expect(parseAmount("62,500")?.toString()).toBe("62500");
    expect(parseAmount("6,25,000")?.toString()).toBe("625000"); // 6,25,000 → 6.25L
  });
  it("rupee prefix", () => {
    expect(parseAmount("₹62,500")?.toString()).toBe("62500");
  });
  it("'k' suffix", () => {
    expect(parseAmount("62.5k")?.toString()).toBe("62500");
    expect(parseAmount("5K")?.toString()).toBe("5000");
  });
  it("'l' / 'lakh' / 'lakhs' suffix", () => {
    expect(parseAmount("1.2l")?.toString()).toBe("120000");
    expect(parseAmount("3 lakh")?.toString()).toBe("300000");
    expect(parseAmount("15 LAKHS")?.toString()).toBe("1500000");
  });
  it("'cr' / 'crore' suffix", () => {
    expect(parseAmount("1cr")?.toString()).toBe("10000000");
    expect(parseAmount("1.5 Crore")?.toString()).toBe("15000000");
  });
  it("decimals are preserved", () => {
    expect(parseAmount("62.75")?.toString()).toBe("62.75");
  });
  it("rejects garbage", () => {
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("12,500xyz")).toBeNull();
  });
  it("rejects unknown suffix", () => {
    expect(parseAmount("62m")).toBeNull();
  });
});
