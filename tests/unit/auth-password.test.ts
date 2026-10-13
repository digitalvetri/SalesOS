import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from "@/server/auth/password";

describe("password hashing (scrypt)", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const h = await hashPassword("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", h)).toBe(true);
    expect(await verifyPassword("correct-horse-9", h)).toBe(false);
    expect(await verifyPassword("", h)).toBe(false);
  });

  it("never stores the password and salts every hash", async () => {
    const a = await hashPassword("same-password-1");
    const b = await hashPassword("same-password-1");
    expect(a).not.toContain("same-password-1");
    expect(a).not.toBe(b);
    expect(a.startsWith("scrypt$")).toBe(true);
  });

  it("rejects malformed or missing hashes instead of throwing", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "scrypt$broken")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$whatever")).toBe(false);
  });

  it("exposes a minimum length of 8", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});
