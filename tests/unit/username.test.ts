// Sign in with a name ("naren", "sadmin") instead of an email.
import { describe, it, expect } from "vitest";
import { normalizeUsername, usernameError, looksLikeEmail } from "@/server/domain/auth/username";
import { resolveLoginWhere } from "@/server/auth/loginIdentity";

describe("usernames", () => {
  it("normalise: trim, lowercase, single spaces", () => {
    expect(normalizeUsername("  Naren  ")).toBe("naren");
    expect(normalizeUsername("SADMIN")).toBe("sadmin");
    expect(normalizeUsername("Viji   K")).toBe("viji k");
  });
  it("validate", () => {
    expect(usernameError("n")).toMatch(/2/);
    expect(usernameError("naren")).toBeNull();
    expect(usernameError("na<me")).toMatch(/letters/);
  });
  it("tell emails apart", () => {
    expect(looksLikeEmail("a@b.com")).toBe(true);
    expect(looksLikeEmail("naren")).toBe(false);
  });
  it("login looks up by username, or by email when it looks like one", () => {
    expect(resolveLoginWhere(" SADMIN ")).toEqual({ username: "sadmin" });
    expect(resolveLoginWhere("Naren")).toEqual({ username: "naren" });
    expect(resolveLoginWhere("Kumar@Gmail.com")).toEqual({ email: "kumar@gmail.com" });
  });
});
