import { describe, it, expect } from "vitest";
import { snoKey, nextSerialNo } from "@/server/domain/v1_1/serialNo";

describe("v1.1 S.No", () => {
  it("builds the counter key", () => {
    expect(snoKey("cmv3abcdef0001xyz")).toBe("SNO:cmv3abcdef0001xyz");
  });
  it("rejects malformed ids", () => {
    expect(() => snoKey("bad id with spaces")).toThrow();
    expect(() => snoKey("x/y")).toThrow();
  });
  it("increments the counter", () => {
    expect(nextSerialNo(0)).toBe(1);
    expect(nextSerialNo(42)).toBe(43);
  });
  it("rejects non-integer / negative counters", () => {
    expect(() => nextSerialNo(1.5)).toThrow();
    expect(() => nextSerialNo(-1)).toThrow();
  });
});
