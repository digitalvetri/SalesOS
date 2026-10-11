// §4.2 "Update production/dispatch status" row: Owner, Admin, Dispatch only.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const mockGetSession = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));
const svc = vi.fn();
vi.mock("@/server/services/dispatchService", () => ({
  startProduction: svc,
  markReady: svc,
  createDispatch: svc,
  markDelivered: svc,
  handOverNow: svc,
}));

const session = (role: string) => ({ tenantId: "t1", role, userId: "u1", user: {} });
const cases = [
  ["startProductionAction", { orderId: "o1" }],
  ["markReadyAction", { orderId: "o1" }],
  ["createDispatchAction", { orderId: "o1", picks: [{ orderLineId: "l1", qty: 1 }], dispatchedOn: "2026-10-11" }],
  ["markDeliveredAction", { dispatchId: "d1", deliveredOn: "2026-10-11" }],
  ["handOverNowAction", { orderId: "o1", today: "2026-10-11" }],
] as const;

describe("dispatch actions — role matrix", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    svc.mockReset();
    svc.mockResolvedValue({ ok: true });
  });
  for (const [name, payload] of cases) {
    it(`${name}: Sales + Accounts refused; Dispatch, Admin, Owner allowed`, async () => {
      const mod = await import("@/app/(app)/dispatch/actions");
      const action = mod[name] as (raw: unknown) => Promise<{ ok: boolean; error?: { code: string } }>;
      for (const role of ["SALES", "ACCOUNTS"]) {
        mockGetSession.mockResolvedValue(session(role));
        expect(await action(payload)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      }
      expect(svc).not.toHaveBeenCalled();
      for (const role of ["DISPATCH", "ADMIN", "OWNER"]) {
        mockGetSession.mockResolvedValue(session(role));
        expect(await action(payload)).toMatchObject({ ok: true });
      }
    });
  }
  it("createDispatch rejects more than 4 photos and fractional qty", async () => {
    mockGetSession.mockResolvedValue(session("DISPATCH"));
    const { createDispatchAction } = await import("@/app/(app)/dispatch/actions");
    const base = { orderId: "o1", picks: [{ orderLineId: "l1", qty: 1 }], dispatchedOn: "2026-10-11" };
    expect(await createDispatchAction({ ...base, photoPaths: ["a", "b", "c", "d", "e"] })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await createDispatchAction({ ...base, picks: [{ orderLineId: "l1", qty: 1.5 }] })).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});
