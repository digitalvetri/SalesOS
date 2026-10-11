// Matrix-driven test of §4.2. If the spec table changes, this test is the first thing to update.
import { describe, it, expect } from "vitest";
import { can, assertCan, PERMISSION_MATRIX, ACTIONS } from "@/server/auth/permissions";
import type { Role } from "@/server/repo/client";

const ROLES: Role[] = ["OWNER", "ADMIN", "ACCOUNTS", "SALES", "DISPATCH"];

describe("permission matrix (§4.2)", () => {
  // ──── Expected results, literal from the spec. Keep diffable row-by-row. ────
  const expected = PERMISSION_MATRIX;

  for (const action of ACTIONS) {
    for (const role of ROLES) {
      const level = expected[action][role];
      const title = `${role} / ${action} → ${level}`;

      it(title, () => {
        // Build a context that satisfies "own" / "ownRequest" when the matrix level is own-ish.
        const ownCtx = { isOwn: true };
        const notOwnCtx = { isOwn: false };

        switch (level) {
          case "full":
          case "readOnly":
            expect(can(role, action)).toBe(true);
            expect(can(role, action, ownCtx)).toBe(true);
            break;
          case "own":
          case "ownRequest":
            expect(can(role, action, ownCtx)).toBe(true);
            expect(can(role, action, notOwnCtx)).toBe(false);
            expect(can(role, action)).toBe(false);
            break;
          case "denied":
            expect(can(role, action, ownCtx)).toBe(false);
            expect(can(role, action, notOwnCtx)).toBe(false);
            expect(can(role, action)).toBe(false);
            break;
        }
      });
    }
  }

  it("assertCan throws FORBIDDEN when denied", () => {
    expect(() => assertCan("SALES", "admin.dashboard")).toThrowError(/do not have permission/);
  });

  it("Admin cannot create Owner (users.createOwner denied)", () => {
    expect(can("ADMIN", "users.createOwner")).toBe(false);
    expect(can("OWNER", "users.createOwner")).toBe(true);
  });

  it("Dispatch can view orders but not prices", () => {
    expect(can("DISPATCH", "orders.view")).toBe(true);
    expect(can("DISPATCH", "orders.viewPrices")).toBe(false);
  });
});
