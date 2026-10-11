// P0 gate evidence: a SALES user receives FORBIDDEN when invoking an admin-only Server Action.
// This test mocks the session layer so it needs no DB — the point is to prove assertCan()
// is wired into the standard Server Action envelope and refuses the call.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Mock out next/cache so revalidatePath() is a no-op outside a Next runtime.
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// Mock the session resolver before the action is loaded.
const mockGetSession = vi.fn();
vi.mock("@/server/auth/session", () => ({
  getSession: mockGetSession,
}));

async function loadAction() {
  const { makeServerAction } = await import("@/lib/serverAction");
  return makeServerAction({
    input: z.object({ month: z.string().min(1) }),
    action: "admin.dashboard",
    async run() {
      return { total: 100000 };
    },
  });
}

describe("Server Action — SALES user is forbidden from admin.dashboard", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
  });

  it("returns FORBIDDEN for a SALES user", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u-sales", tenantId: "t1", role: "SALES" },
      tenantId: "t1",
      role: "SALES",
      userId: "u-sales",
    });

    const action = await loadAction();
    const result = await action({ month: "2026-10" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
  });

  it("allows the same action for an ADMIN user", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u-admin", tenantId: "t1", role: "ADMIN" },
      tenantId: "t1",
      role: "ADMIN",
      userId: "u-admin",
    });

    const action = await loadAction();
    const result = await action({ month: "2026-10" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ total: 100000 });
    }
  });

  it("returns UNAUTHENTICATED when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const action = await loadAction();
    const result = await action({ month: "2026-10" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNAUTHENTICATED");
    }
  });
});
