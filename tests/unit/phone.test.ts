// BR-06 — phone normalisation. 100% branch coverage required on src/server/domain.
import { describe, it, expect } from "vitest";
import { normalizePhone, tryNormalizePhone, PhoneParseError } from "@/server/domain/phone";

describe("normalizePhone — Indian subscriber numbers", () => {
  it.each([
    ["9843722055", "+919843722055"],
    ["09843722055", "+919843722055"],
    ["919843722055", "+919843722055"],
    ["+919843722055", "+919843722055"],
    ["98437 22055", "+919843722055"],
    ["98437-22055", "+919843722055"],
    ["(984) 372-2055", "+919843722055"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input).e164).toBe(expected);
  });

  it("formats display with Indian grouping", () => {
    expect(normalizePhone("9843722055").display).toBe("+91 98437 22055");
  });

  it("rejects Indian subscriber not starting 6–9", () => {
    expect(() => normalizePhone("5843722055")).toThrow(PhoneParseError);
    expect(() => normalizePhone("0123456789")).toThrow(PhoneParseError);
  });

  it("rejects short / long numbers", () => {
    expect(() => normalizePhone("9843")).toThrow(PhoneParseError);
    expect(() => normalizePhone("98437220550000")).toThrow(PhoneParseError);
  });

  it("rejects empty / whitespace", () => {
    expect(() => normalizePhone("")).toThrow(PhoneParseError);
    expect(() => normalizePhone("   ")).toThrow(PhoneParseError);
  });

  it("rejects non-digit after +", () => {
    expect(() => normalizePhone("+91abc")).toThrow(PhoneParseError);
  });
});

describe("normalizePhone — international numbers", () => {
  it("accepts +1 US", () => {
    expect(normalizePhone("+14155551234").e164).toBe("+14155551234");
  });

  it("accepts +44 UK", () => {
    expect(normalizePhone("+442071838750").e164).toBe("+442071838750");
  });

  it("rejects too-short international", () => {
    expect(() => normalizePhone("+1234")).toThrow(PhoneParseError);
  });

  it("rejects too-long international", () => {
    expect(() => normalizePhone("+1234567890123456")).toThrow(PhoneParseError);
  });
});

describe("tryNormalizePhone", () => {
  it("returns null on parse error", () => {
    expect(tryNormalizePhone("not a phone")).toBeNull();
  });

  it("returns value on success", () => {
    expect(tryNormalizePhone("9843722055")?.e164).toBe("+919843722055");
  });
});

describe("PhoneParseError", () => {
  it("preserves reason", () => {
    try {
      normalizePhone("");
    } catch (e) {
      expect(e).toBeInstanceOf(PhoneParseError);
      expect((e as PhoneParseError).reason).toBe("empty");
      expect((e as PhoneParseError).name).toBe("PhoneParseError");
    }
  });
});
