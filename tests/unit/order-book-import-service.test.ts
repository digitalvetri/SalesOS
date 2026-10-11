// Covers the orchestration helpers in orderBookImport.ts that aren't exercised
// by the pure-parser suite — role gating, assignment filtering, duplicate skip
// semantics. The DB-backed commit path is exercised in the P7 release test.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@/lib/errors";

const findBatch = vi.fn();
const updateBatch = vi.fn();
const prismaMock = {
  importBatch: { findFirst: findBatch, update: updateBatch },
  billingEntity: { findFirst: vi.fn().mockResolvedValue({ id: "e1", code: "KI", active: true }) },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
};

vi.mock("@/server/repo/client", async (orig) => {
  const actual = await orig<typeof import("@/server/repo/client")>();
  return { ...actual, prisma: prismaMock };
});

vi.mock("@/server/repo/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/server/repo/counters", () => ({ allocateCounter: vi.fn().mockResolvedValue(1) }));

describe("orderBookImport — commit guards", () => {
  beforeEach(() => {
    findBatch.mockReset();
    updateBatch.mockReset();
  });

  it("refuses non-admin roles", async () => {
    const { commitImport } = await import("@/server/services/orderBookImport");
    await expect(
      commitImport({
        tenantId: "t1",
        actorId: "u1",
        actorRole: "SALES",
        batchId: "b1",
        assignments: {},
      }),
    ).rejects.toThrow(AppError);
  });

  it("errors when the batch cannot be found", async () => {
    findBatch.mockResolvedValue(null);
    const { commitImport } = await import("@/server/services/orderBookImport");
    await expect(
      commitImport({
        tenantId: "t1",
        actorId: "u1",
        actorRole: "OWNER",
        batchId: "missing",
        assignments: {},
      }),
    ).rejects.toThrow(/batch not found/i);
  });

  it("refuses a batch that is already committed", async () => {
    findBatch.mockResolvedValue({ id: "b1", status: "COMMITTED", rowsJson: [] });
    const { commitImport } = await import("@/server/services/orderBookImport");
    await expect(
      commitImport({
        tenantId: "t1",
        actorId: "u1",
        actorRole: "OWNER",
        batchId: "b1",
        assignments: {},
      }),
    ).rejects.toThrow(/already been committed/i);
  });

  it("skips SKIP sheets, duplicates, and explicit excludes without touching the DB", async () => {
    findBatch.mockResolvedValue({
      id: "b1",
      status: "PARSED",
      rowsJson: [
        {
          ref: "VIJI!R10",
          sheet: "VIJI",
          date: "2026-05-01",
          month: "2026-05",
          customerName: "A",
          phone: "9800000001",
          lines: ["x"],
          amount: "1000",
          advance: "0",
          balance: "1000",
          status: "CONFIRMED",
          cancelNote: null,
          route: null,
          flags: ["POSSIBLE_DUPLICATE"],
        },
        {
          ref: "SKIPPED!R1",
          sheet: "TURBO",
          date: "2026-05-01",
          month: "2026-05",
          customerName: "B",
          phone: "9800000002",
          lines: ["y"],
          amount: "1000",
          advance: "0",
          balance: "1000",
          status: "CONFIRMED",
          cancelNote: null,
          route: null,
          flags: [],
        },
        {
          ref: "EXCL!R1",
          sheet: "MALLIKA",
          date: "2026-05-01",
          month: "2026-05",
          customerName: "C",
          phone: "9800000003",
          lines: ["z"],
          amount: "1000",
          advance: "0",
          balance: "1000",
          status: "CONFIRMED",
          cancelNote: null,
          route: null,
          flags: [],
        },
      ],
    });
    const { commitImport } = await import("@/server/services/orderBookImport");
    const summary = await commitImport({
      tenantId: "t1",
      actorId: "u1",
      actorRole: "OWNER",
      batchId: "b1",
      assignments: {
        VIJI: { kind: "SALESPERSON", salespersonId: "u-viji" },
        TURBO: { kind: "SKIP" },
        MALLIKA: { kind: "SALESPERSON", salespersonId: "u-mallika" },
      },
      include: { "EXCL!R1": false, "VIJI!R10": false },
    });
    expect(summary.importedOrders).toBe(0);
    expect(summary.importedCustomers).toBe(0);
    expect(summary.importedPayments).toBe(0);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(updateBatch).toHaveBeenCalled();
  });
});
