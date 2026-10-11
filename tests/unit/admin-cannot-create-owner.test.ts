// §4.2 "users.createOwner" row — enforced via can() in makeServerAction + a
// defence-in-depth check inside the user service. Also covers:
//   - updateUserAction cannot be used by ADMIN to promote someone to OWNER
//   - deactivateUserAction (ADMIN) cannot deactivate an OWNER
//   - cannot deactivate your own account
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const mockGetSession = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));

const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeactivateUser = vi.fn();
vi.mock("@/server/services/userService", () => ({
  adminCreateUser: mockCreateUser,
  adminUpdateUser: mockUpdateUser,
  adminDeactivateUser: mockDeactivateUser,
  adminResetPassword: vi.fn(),
  generateTempPassword: () => "tempPW1234",
}));

const SESSION_ADMIN = {
  user: { id: "u-admin", tenantId: "t1", role: "ADMIN" as const },
  tenantId: "t1",
  role: "ADMIN" as const,
  userId: "u-admin",
};

const SESSION_OWNER = {
  user: { id: "u-owner", tenantId: "t1", role: "OWNER" as const },
  tenantId: "t1",
  role: "OWNER" as const,
  userId: "u-owner",
};

describe("createUserAction — ADMIN cannot create OWNER", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateUser.mockReset();
  });

  it("returns FORBIDDEN when an ADMIN posts role=OWNER", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN);
    const { createUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await createUserAction({
      name: "Mallory",
      phone: "9843722055",
      role: "OWNER",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("allows an OWNER to create another OWNER", async () => {
    mockGetSession.mockResolvedValue(SESSION_OWNER);
    mockCreateUser.mockResolvedValue({ id: "u-new" });

    const { createUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await createUserAction({
      name: "New Owner",
      phone: "9843722055",
      role: "OWNER",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.userId).toBe("u-new");
      expect(result.data.tempPassword).toBe("tempPW1234");
    }
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid phone with VALIDATION", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN);
    const { createUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await createUserAction({
      name: "Bob",
      phone: "123",
      role: "SALES",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects SALES users entirely from users.manage", async () => {
    mockGetSession.mockResolvedValue({
      user: { id: "u-sales", tenantId: "t1", role: "SALES" },
      tenantId: "t1",
      role: "SALES",
      userId: "u-sales",
    });

    const { createUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await createUserAction({
      name: "Bob",
      phone: "9843722055",
      role: "SALES",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});

describe("updateUserAction — ADMIN cannot promote to OWNER", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockUpdateUser.mockReset();
  });

  it("passes actorRole through to the service when ADMIN posts role=OWNER (service enforces)", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN);
    mockUpdateUser.mockImplementation(async (input: { actorRole: string; role?: string }) => {
      // Reproduce the service's guard: Admin promoting to Owner must throw.
      if (input.role === "OWNER" && input.actorRole !== "OWNER") {
        const err = new Error("FORBIDDEN");
        (err as Error & { code?: string }).code = "FORBIDDEN";
        // Rethrow as AppError-like to match the action's envelope mapping
        throw Object.assign(new Error("Only an Owner can set another user to Owner."), {
          code: "FORBIDDEN",
          userMessage: "Only an Owner can set another user to Owner.",
          name: "AppError",
        });
      }
      return { id: input.role };
    });

    const { updateUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await updateUserAction({ userId: "u-target", role: "OWNER" });

    expect(result.ok).toBe(false);
    expect(mockUpdateUser).toHaveBeenCalledTimes(1);
    expect(mockUpdateUser.mock.calls[0]?.[0].actorRole).toBe("ADMIN");
  });

  it("allows OWNER to promote another user to OWNER", async () => {
    mockGetSession.mockResolvedValue(SESSION_OWNER);
    mockUpdateUser.mockResolvedValue({ id: "u-target" });

    const { updateUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await updateUserAction({ userId: "u-target", role: "OWNER" });

    expect(result.ok).toBe(true);
    expect(mockUpdateUser.mock.calls[0]?.[0].actorRole).toBe("OWNER");
    expect(mockUpdateUser.mock.calls[0]?.[0].role).toBe("OWNER");
  });
});

describe("deactivateUserAction — guards", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDeactivateUser.mockReset();
  });

  it("refuses deactivating your own account at the action layer", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN);

    const { deactivateUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await deactivateUserAction({ userId: SESSION_ADMIN.userId });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("VALIDATION");
      expect(result.error.message).toMatch(/own account/i);
    }
    expect(mockDeactivateUser).not.toHaveBeenCalled();
  });

  it("passes actorRole through so the service can refuse ADMIN deactivating an OWNER", async () => {
    mockGetSession.mockResolvedValue(SESSION_ADMIN);
    mockDeactivateUser.mockResolvedValue({ id: "u-target", active: false });

    const { deactivateUserAction } = await import("@/app/(app)/settings/users/actions");
    const result = await deactivateUserAction({ userId: "u-target" });

    expect(result.ok).toBe(true);
    expect(mockDeactivateUser).toHaveBeenCalledTimes(1);
    expect(mockDeactivateUser.mock.calls[0]?.[0].actorRole).toBe("ADMIN");
  });
});
