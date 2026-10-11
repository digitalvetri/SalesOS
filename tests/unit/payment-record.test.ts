import { describe, it, expect } from "vitest";
import {
  inferPaymentType,
  istDateString,
  isPaidOnAllowed,
  isProofMime,
  proofPathFor,
  isProofPathFor,
  fitWithin,
  sniffImageMime,
} from "@/server/domain/payment/record";

describe("inferPaymentType", () => {
  it("FINAL when the amount covers the balance", () => {
    expect(inferPaymentType({ amount: "14000", balanceDue: "14000", priorLivePayments: 1 })).toBe("FINAL");
  });
  it("FINAL within the ₹1 rounding tolerance", () => {
    expect(inferPaymentType({ amount: "13999.50", balanceDue: "14000", priorLivePayments: 0 })).toBe("FINAL");
  });
  it("ADVANCE for the first partial payment", () => {
    expect(inferPaymentType({ amount: "5000", balanceDue: "24000", priorLivePayments: 0 })).toBe("ADVANCE");
  });
  it("PART for later partial payments", () => {
    expect(inferPaymentType({ amount: "5000", balanceDue: "14000", priorLivePayments: 2 })).toBe("PART");
  });
  it("never FINAL when nothing is due", () => {
    expect(inferPaymentType({ amount: "5000", balanceDue: "0", priorLivePayments: 1 })).toBe("PART");
  });
});

describe("IST dates", () => {
  it("rolls over to the next day after 18:30 UTC", () => {
    expect(istDateString(new Date("2026-10-10T18:29:00Z"))).toBe("2026-10-10");
    expect(istDateString(new Date("2026-10-10T18:31:00Z"))).toBe("2026-10-11");
  });
  it("allows today and past dates, refuses future ones", () => {
    const now = new Date("2026-10-10T20:00:00Z"); // 11 Oct 01:30 IST
    expect(isPaidOnAllowed(new Date("2026-10-11"), now)).toBe(true);
    expect(isPaidOnAllowed(new Date("2026-09-01"), now)).toBe(true);
    expect(isPaidOnAllowed(new Date("2026-10-12"), now)).toBe(false);
  });
  it("refuses invalid dates", () => {
    expect(isPaidOnAllowed(new Date("nope"), new Date())).toBe(false);
  });
});

describe("proof paths", () => {
  it("accepts only image mimes", () => {
    expect(isProofMime("image/jpeg")).toBe(true);
    expect(isProofMime("application/pdf")).toBe(false);
  });
  it("round-trips a minted path", () => {
    const p = proofPathFor("t1", "o1", "abc-123", "image/webp");
    expect(p).toBe("t1/o1/abc-123.webp");
    expect(isProofPathFor(p, "t1", "o1")).toBe(true);
    expect(isProofPathFor(proofPathFor("t1", "o1", "x", "image/jpeg"), "t1", "o1")).toBe(true);
    expect(isProofPathFor(proofPathFor("t1", "o1", "x", "image/png"), "t1", "o1")).toBe(true);
  });
  it("rejects paths for another tenant or order", () => {
    expect(isProofPathFor("t2/o1/a.jpg", "t1", "o1")).toBe(false);
    expect(isProofPathFor("t1/o2/a.jpg", "t1", "o1")).toBe(false);
  });
  it("rejects traversal, wrong depth and bad extensions", () => {
    expect(isProofPathFor("t1/o1/../a.jpg", "t1", "o1")).toBe(false);
    expect(isProofPathFor("t1/o1/x/a.jpg", "t1", "o1")).toBe(false);
    expect(isProofPathFor("t1/o1/a.pdf", "t1", "o1")).toBe(false);
    expect(isProofPathFor("t1/o1/a b.jpg", "t1", "o1")).toBe(false);
  });
});

describe("fitWithin", () => {
  it("keeps small images as-is", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
  it("caps the longest edge and keeps aspect", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(1080, 2400, 1600)).toEqual({ width: 720, height: 1600 });
  });
});

describe("sniffImageMime", () => {
  it("recognises jpeg, png and webp headers", () => {
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageMime(webp)).toBe("image/webp");
  });
  it("rejects anything else", () => {
    expect(sniffImageMime(new TextEncoder().encode("%PDF-1.7 blah"))).toBeNull();
    expect(sniffImageMime(new TextEncoder().encode("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
    expect(sniffImageMime(new Uint8Array([]))).toBeNull();
  });
});
