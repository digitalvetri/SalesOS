import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptSecret, decryptSecret, verifyMetaSignature, signMetaBody } from "@/server/security/secrets";

const KEY = randomBytes(32).toString("base64");

describe("AES-256-GCM secrets", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("EAAG-token", KEY);
    const b = encryptSecret("EAAG-token", KEY);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain("EAAG");
    expect(decryptSecret(a, KEY)).toBe("EAAG-token");
  });
  it("detects tampering and wrong keys", () => {
    const sealed = encryptSecret("secret", KEY);
    const [v, iv, tag, ct] = sealed.split(":");
    const flipped = Buffer.from(ct!, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"), KEY)).toThrow();
    expect(() => decryptSecret(sealed, randomBytes(32).toString("base64"))).toThrow();
    expect(() => decryptSecret("garbage", KEY)).toThrow(/format/);
  });
  it("rejects missing or short keys", () => {
    expect(() => encryptSecret("x", "")).toThrow(/not set/);
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("Meta webhook signature", () => {
  const body = JSON.stringify({ entry: [{ id: "1" }] });
  it("accepts the right signature", () => {
    expect(verifyMetaSignature(body, signMetaBody(body, "app-secret"), "app-secret")).toBe(true);
  });
  it("rejects wrong secret, tampered body, missing or malformed header", () => {
    expect(verifyMetaSignature(body, signMetaBody(body, "other"), "app-secret")).toBe(false);
    expect(verifyMetaSignature(body + " ", signMetaBody(body, "app-secret"), "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha256=zz", "app-secret")).toBe(false);
  });
});
