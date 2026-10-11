// recordPaymentAction envelope: ownership via the order's salesperson, role
// matrix (§4.2 "Record payment"), input decoding. Service + DB are mocked.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const mockGetSession = vi.fn();
vi.mock("@/server/auth/session", () => ({ getSession: mockGetSession }));

const mockFindOrder = vi.fn();
vi.mock("@/server/repo/client", () => ({
  prisma: { order: { findFirst: mockFindOrder } },
}));

const mockRecord = vi.fn();
vi.mock("@/server/services/paymentService", () => ({ recordPayment: mockRecord }));

vi.mock("@/lib/idempotency", () => ({
  withIdempotency: async ({ work }: { work: () => Promise<unknown> }) => ({
    kind: "fresh",
    value: await work(),
  }),
}));

const session = (role: string, userId = "u1") => ({ tenantId: "t1", role, userId, user: {} });

const input = (over: Record<string, unknown> = {}) => ({
  idempotencyKey: "4f1c2f0e-8b7a-4c55-9a7e-0d6c7f3e2a11",
  orderId: "o1",
  amount: "14,000",
  method: "UPI",
  paidOn: "2026-10-10",
  receivedInto: "account:acc1",
  referenceNo: "UTR123",
  ...over,
});

async function load() {
  return (await import("@/app/(app)/payments/actions")).recordPaymentAction;
}

describe("recordPaymentAction", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockFindOrder.mockReset();
    mockRecord.mockReset();
    mockRecord.mockResolvedValue({ paymentId: "p1", receiptNo: "RCPT/26-27/00001", type: "FINAL" });
  });

  it("lets Sales record on their own order and decodes the payload", async () => {
    mockGetSession.mockResolvedValue(session("SALES", "u1"));
    mockFindOrder.mockResolvedValue({ salespersonId: "u1" });
    const r = await (await load())(input());
    expect(r.ok).toBe(true);
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        orderId: "o1",
        amount: "14000",
        receivedIntoAccountId: "acc1",
        receivedByUserId: null,
        paidOn: new Date("2026-10-10T00:00:00.000Z"),
      }),
    );
  });

  it("maps user:{id} to a personal receiver", async () => {
    mockGetSession.mockResolvedValue(session("ACCOUNTS"));
    mockFindOrder.mockResolvedValue({ salespersonId: "someone" });
    await (await load())(input({ receivedInto: "user:u9" }));
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({ receivedIntoAccountId: null, receivedByUserId: "u9" }),
    );
  });

  it("refuses Sales on someone else's order", async () => {
    mockGetSession.mockResolvedValue(session("SALES", "u1"));
    mockFindOrder.mockResolvedValue({ salespersonId: "u2" });
    const r = await (await load())(input());
    expect(r).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("refuses Dispatch outright", async () => {
    mockGetSession.mockResolvedValue(session("DISPATCH"));
    mockFindOrder.mockResolvedValue({ salespersonId: "u1" });
    const r = await (await load())(input());
    expect(r).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects a malformed receiver or date", async () => {
    mockGetSession.mockResolvedValue(session("OWNER"));
    mockFindOrder.mockResolvedValue({ salespersonId: "u1" });
    const action = await load();
    expect(await action(input({ receivedInto: "bank" }))).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await action(input({ paidOn: "10/10/2026" }))).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
