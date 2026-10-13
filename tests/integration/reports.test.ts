// §11.14 / §17-P5: each of the 7 reports opens as a valid workbook in the house
// format (one header row, frozen panes, ₹ + date formats) and Sales gets own rows only.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { buildReport, REPORTS, MONEY_FMT, DATE_FMT, type ReportKind } from "@/server/services/reportService";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55433\b/.test(process.env.DATABASE_URL!) || process.env.SB_INTEGRATION_TESTS === "1");

const NOW = new Date("2026-10-20T06:00:00Z");
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function open(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}
const header = (ws: ExcelJS.Worksheet) => (ws.getRow(1).values as unknown[]).slice(1);
const colOf = (ws: ExcelJS.Worksheet, name: string) => header(ws).indexOf(name) + 1;

describe.skipIf(!DB_READY)("§11.14 reports", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let viji = "";
  let naren = "";

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug: `test-rep-${stamp}`, name: "reports", settings: { create: {} } } })).id;
    const ki = (await prisma.billingEntity.create({ data: { tenantId, code: `R${stamp.slice(-5)}`, name: "KI" } })).id;
    const bank = (await prisma.account.create({ data: { tenantId, entityId: ki, label: "KI Current A/c", kind: "BANK" } })).id;
    const u = (n: string, role: "OWNER" | "SALES", p: string) =>
      prisma.user.create({ data: { tenantId, authUserId: `rep-${stamp}:${n}`, name: n, phoneE164: p, role, canReceivePayments: role === "SALES" } });
    const owner = (await u("Owner", "OWNER", "+919999993001")).id;
    viji = (await u("Viji", "SALES", "+919999993002")).id;
    naren = (await u("Naren", "SALES", "+919999993003")).id;
    const c1 = (await prisma.customer.create({ data: { tenantId, name: "Gokul", phoneE164: "+919999993101", city: "Salem" } })).id;
    const c2 = (await prisma.customer.create({ data: { tenantId, name: "Rew", phoneE164: "+919999993102" } })).id;
    let n = 0;
    const mk = (sp: string, cust: string, date: string, total: string, status: string, balance: string, extra: Record<string, unknown> = {}) =>
      prisma.order.create({
        data: {
          tenantId, number: `R/${++n}`, entityId: ki, customerId: cust, salespersonId: sp, orderDate: day(date), status: status as never,
          subtotal: total, total, balanceDue: balance, createdById: owner,
          lines: { create: [{ description: "Grinder", qty: 2, unitPrice: String(Number(total) / 2), gstRate: "18", lineTotal: total }] },
          ...extra,
        },
      });
    const o1 = await mk(viji, c1, "2026-10-05", "50000", "DELIVERED", "30000", {
      promisedPaymentDate: day("2026-10-01"),
      payments: { create: [
        { tenantId, receiptNo: `RCPT-${stamp}-1`, type: "ADVANCE", method: "UPI", amount: "15000", paidOn: day("2026-10-05"), receivedIntoAccountId: bank, status: "VERIFIED", verifiedById: owner, verifiedAt: day("2026-10-06"), referenceNo: "UTR1", createdById: viji },
        { tenantId, receiptNo: `RCPT-${stamp}-2`, type: "PART", method: "CASH", amount: "5000", paidOn: day("2026-10-08"), receivedByUserId: viji, createdById: viji },
      ] },
    });
    await mk(naren, c2, "2026-10-10", "40000", "CONFIRMED", "40000");
    await mk(naren, c2, "2026-10-02", "20000", "CANCELLED", "0", {
      cancelReason: "PRICE",
      events: { create: [{ actorId: owner, type: "STATUS_CHANGE", toStatus: "CANCELLED", at: new Date("2026-10-03T06:00:00Z") }] },
    });
    void o1;
  }, 60_000);

  afterAll(async () => {
    await prisma.orderEvent.deleteMany({ where: { order: { tenantId } } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.orderLine.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  const scope = () => ({ tenantId, from: "2026-10-01", to: "2026-10-20" });

  const expectations: Record<ReportKind, { rows: number; money: string; date?: string; first: unknown[] }> = {
    "sales-register": { rows: 3, money: "Line total", date: "Order date", first: ["R/3", "CANCELLED"] },
    collections: { rows: 2, money: "Amount", date: "Paid on", first: [`RCPT-`, "UTR1"] },
    outstanding: { rows: 2, money: "Outstanding", first: ["Gokul", 30000] },
    "salesperson-performance": { rows: 2, money: "Booked", first: ["Viji", 50000] },
    "cash-with-staff": { rows: 1, money: "Amount", date: "Paid on", first: ["Viji", "With staff"] },
    cancellations: { rows: 1, money: "Order total", date: "Cancelled on", first: ["R/3", "PRICE"] },
    "product-sales": { rows: 1, money: "Value", first: ["Grinder", 4] }, // cancelled order excluded
  };

  for (const kind of REPORTS) {
    it(`${kind}: header row, frozen pane, ₹ + date formats, rows`, async () => {
      const ws = await open(await buildReport(kind, scope(), NOW));
      const e = expectations[kind];
      expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
      expect(ws.getRow(1).font?.bold).toBe(true);
      expect(ws.rowCount - 1).toBe(e.rows);
      expect(ws.getColumn(colOf(ws, e.money)).numFmt).toBe(MONEY_FMT);
      expect(ws.getRow(2).getCell(colOf(ws, e.money)).numFmt).toBe(MONEY_FMT);
      if (e.date) {
        expect(ws.getRow(2).getCell(colOf(ws, e.date)).numFmt).toBe(DATE_FMT);
        expect(ws.getRow(2).getCell(colOf(ws, e.date)).value).toBeInstanceOf(Date);
      }
      const flat = (ws.getRow(2).values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v));
      for (const want of e.first) {
        expect(flat.some((v) => (typeof want === "string" ? String(v ?? "").startsWith(want) : v === want))).toBe(true);
      }
    });
  }

  it("Sales scope: own orders only", async () => {
    const ws = await open(await buildReport("sales-register", { ...scope(), salespersonScope: viji }, NOW));
    expect(ws.rowCount - 1).toBe(1);
    const perf = await open(await buildReport("salesperson-performance", { ...scope(), salespersonScope: naren }, NOW));
    expect((perf.getRow(2).values as unknown[]).slice(1)[0]).toBe("Naren");
    expect(perf.rowCount - 1).toBe(1);
  });
});
