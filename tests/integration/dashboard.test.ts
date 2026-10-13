// §17-P5 gate: seeded data → each §9 metric equals a hand-computed value.
// "Now" is fixed at 20 Oct 2026 (IST); period = this month (1–20 Oct).
//
// Fixture (all ₹):
//  O1 KI  Viji  05-Oct  50,000 CONFIRMED   paid 20,000 verified (05-Oct)           bal 30,000  · confirmed 15 d → stuck
//  O2 KI  Viji  12-Oct  30,000 DELIVERED   10,000 cash pending, with Viji          bal 20,000  · delivered 12-Oct, grace 7 → overdue 1 d
//  O3 KFM Naren 15-Oct  40,000 CONFIRMED   promised pay 01-Sep                     bal 40,000  · overdue 49 d
//  O4 KFM Naren 10-Sep  60,000 CLOSED      paid 60,000 verified (02-Oct)           bal 0
//  O5 KI  Viji  08-Oct  25,000 CANCELLED   PRICE, 5,000 verified + 5,000 refund     bal 0
//  O6 KI  Naren 18-Oct  10,000 PENDING_APPROVAL                                     bal 10,000
//  O7 KFM Viji  15-Dec-25 15,000 DELIVERED promised pay 01-Jun                     bal 15,000  · overdue 141 d
//  O8 KI  Naren 03-Oct  20,000 CANCELLED   DELIVERY_DELAY                           bal 0
//  O9 KI  Viji  06-Oct   8,000 CANCELLED   FINANCIAL_ISSUE, 3,000 verified          bal −3,000 (refund due)
//  Viji's October target: 1,00,000. Customers: C1 = O1,O2,O7,O9 · C2 = O3,O4 · C3 = O5,O6,O8.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import * as dash from "@/server/services/dashboardService";
import { resolvePeriod } from "@/server/domain/dashboard/period";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55433\b/.test(process.env.DATABASE_URL!) || process.env.SB_INTEGRATION_TESTS === "1");

const NOW = new Date("2026-10-20T06:00:00Z");
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe.skipIf(!DB_READY)("§17-P5 gate — dashboard metrics vs hand-computed", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let ki = "";
  let kfm = "";
  const table: { metric: string; expected: string; actual: string }[] = [];

  function check(metric: string, actual: unknown, expected: unknown) {
    const a = typeof actual === "string" ? actual : JSON.stringify(actual);
    const e = typeof expected === "string" ? expected : JSON.stringify(expected);
    table.push({ metric, expected: e, actual: a });
    expect(actual).toEqual(expected);
  }

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({
      data: { slug: `test-dash-${stamp}`, name: "dashboard", settings: { create: { overdueGraceDays: 7, productionAlertDays: 10 } } },
    })).id;
    ki = (await prisma.billingEntity.create({ data: { tenantId, code: `K${stamp.slice(-5)}`, name: "KI" } })).id;
    kfm = (await prisma.billingEntity.create({ data: { tenantId, code: `F${stamp.slice(-5)}`, name: "KFM" } })).id;
    const bank = (await prisma.account.create({ data: { tenantId, entityId: ki, label: "Bank", kind: "BANK" } })).id;
    const user = (name: string, role: "OWNER" | "SALES", phone: string) =>
      prisma.user.create({ data: { tenantId, authUserId: `dash-${stamp}:${name}`, name, phoneE164: phone, role, canReceivePayments: role === "SALES" } });
    const owner = (await user("Owner", "OWNER", "+919999994001")).id;
    const viji = (await user("Viji", "SALES", "+919999994002")).id;
    const naren = (await user("Naren", "SALES", "+919999994003")).id;
    await prisma.salesTarget.create({ data: { tenantId, userId: viji, month: day("2026-10-01"), amount: "100000" } });
    const cust = async (n: string, p: string) => (await prisma.customer.create({ data: { tenantId, name: n, phoneE164: p } })).id;
    const c1 = await cust("Gokul", "+919999994101");
    const c2 = await cust("Rew", "+919999994102");
    const c3 = await cust("Mathews", "+919999994103");
    const cat = (await prisma.productCategory.create({ data: { tenantId, name: `Cat ${stamp}` } })).id;
    const prod = async (name: string) =>
      (await prisma.product.create({ data: { tenantId, categoryId: cat, name, searchText: name.toLowerCase(), aliases: [] } })).id;
    const p1 = await prod("Grinder A");
    const p2 = await prod("Peeler");

    let seq = 0;
    let rcpt = 0;
    const order = async (o: {
      entity: string; sp: string; cust: string; date: string; total: string; status: string; balance: string;
      promisedPay?: string; reason?: string; lines: { productId?: string; description: string; qty: number; lineTotal: string }[];
      payments?: { type: "ADVANCE" | "PART" | "FINAL" | "REFUND"; amount: string; status: "VERIFIED" | "PENDING_VERIFICATION"; paidOn: string; byUser?: string }[];
      events?: { toStatus: string; at: string }[];
    }) => {
      seq += 1;
      return prisma.order.create({
        data: {
          tenantId, number: `T/${seq}`, entityId: o.entity, customerId: o.cust, salespersonId: o.sp,
          orderDate: day(o.date), status: o.status as never, subtotal: o.total, total: o.total, balanceDue: o.balance,
          promisedPaymentDate: o.promisedPay ? day(o.promisedPay) : null, cancelReason: (o.reason as never) ?? null, createdById: owner,
          lines: { create: o.lines.map((l, i) => ({ ...l, unitPrice: l.lineTotal, gstRate: "18", sortOrder: i })) },
          payments: {
            create: (o.payments ?? []).map((p) => ({
              tenantId, receiptNo: `R-${stamp}-${++rcpt}`, type: p.type, method: "UPI" as const, amount: p.amount, status: p.status,
              paidOn: day(p.paidOn), createdById: owner,
              ...(p.byUser ? { receivedByUserId: p.byUser } : { receivedIntoAccountId: bank }),
            })),
          },
          events: { create: (o.events ?? []).map((e) => ({ actorId: owner, type: "STATUS_CHANGE", toStatus: e.toStatus as never, at: new Date(e.at) })) },
        },
      });
    };

    await order({ entity: ki, sp: viji, cust: c1, date: "2026-10-05", total: "50000", status: "CONFIRMED", balance: "30000",
      lines: [{ productId: p1, description: "Grinder A", qty: 2, lineTotal: "50000" }],
      payments: [{ type: "ADVANCE", amount: "20000", status: "VERIFIED", paidOn: "2026-10-05" }] });
    await order({ entity: ki, sp: viji, cust: c1, date: "2026-10-12", total: "30000", status: "DELIVERED", balance: "20000",
      lines: [{ productId: p2, description: "Peeler", qty: 1, lineTotal: "30000" }],
      payments: [{ type: "PART", amount: "10000", status: "PENDING_VERIFICATION", paidOn: "2026-10-12", byUser: viji }],
      events: [{ toStatus: "DELIVERED", at: "2026-10-12T06:00:00Z" }] });
    await order({ entity: kfm, sp: naren, cust: c2, date: "2026-10-15", total: "40000", status: "CONFIRMED", balance: "40000", promisedPay: "2026-09-01",
      lines: [{ productId: p1, description: "Grinder A", qty: 1, lineTotal: "40000" }] });
    await order({ entity: kfm, sp: naren, cust: c2, date: "2026-09-10", total: "60000", status: "CLOSED", balance: "0",
      lines: [{ productId: p2, description: "Peeler", qty: 2, lineTotal: "60000" }],
      payments: [{ type: "FINAL", amount: "60000", status: "VERIFIED", paidOn: "2026-10-02" }] });
    await order({ entity: ki, sp: viji, cust: c3, date: "2026-10-08", total: "25000", status: "CANCELLED", balance: "0", reason: "PRICE",
      lines: [{ productId: p2, description: "Peeler", qty: 1, lineTotal: "25000" }],
      payments: [
        { type: "ADVANCE", amount: "5000", status: "VERIFIED", paidOn: "2026-10-08" },
        { type: "REFUND", amount: "5000", status: "VERIFIED", paidOn: "2026-10-10" },
      ],
      events: [{ toStatus: "CANCELLED", at: "2026-10-09T06:00:00Z" }] });
    await order({ entity: ki, sp: naren, cust: c3, date: "2026-10-18", total: "10000", status: "PENDING_APPROVAL", balance: "10000",
      lines: [{ description: "SS table", qty: 3, lineTotal: "10000" }] });
    await order({ entity: kfm, sp: viji, cust: c1, date: "2025-12-15", total: "15000", status: "DELIVERED", balance: "15000", promisedPay: "2026-06-01",
      lines: [{ productId: p2, description: "Peeler", qty: 1, lineTotal: "15000" }],
      events: [{ toStatus: "DELIVERED", at: "2026-01-10T06:00:00Z" }] });
    await order({ entity: ki, sp: naren, cust: c3, date: "2026-10-03", total: "20000", status: "CANCELLED", balance: "0", reason: "DELIVERY_DELAY",
      lines: [{ productId: p1, description: "Grinder A", qty: 1, lineTotal: "20000" }],
      events: [{ toStatus: "CANCELLED", at: "2026-10-04T06:00:00Z" }] });
    await order({ entity: ki, sp: viji, cust: c1, date: "2026-10-06", total: "8000", status: "CANCELLED", balance: "-3000", reason: "FINANCIAL_ISSUE",
      lines: [{ description: "Spare kit", qty: 1, lineTotal: "8000" }],
      payments: [{ type: "ADVANCE", amount: "3000", status: "VERIFIED", paidOn: "2026-10-06" }],
      events: [{ toStatus: "CANCELLED", at: "2026-10-07T06:00:00Z" }] });
  }, 60_000);

  afterAll(async () => {
    console.log(
      ["[P5-gate] | Metric | Expected | Actual |", "[P5-gate] |---|---|---|", ...table.map((r) => `[P5-gate] | ${r.metric} | ${r.expected} | ${r.actual} |`)].join("\n"),
    );
    await prisma.orderEvent.deleteMany({ where: { order: { tenantId } } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.orderLine.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });
    await prisma.productCategory.deleteMany({ where: { tenantId } });
    await prisma.salesTarget.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  const all = () => ({ tenantId });
  const period = resolvePeriod("this_month", NOW);

  it("Booked (+ vs previous month)", async () => {
    const b = await dash.booked(all(), period);
    check("Booked (Oct 1–20)", b.value, "130000");
    check("Booked (Sep, comparison)", b.previous, "60000");
    check("Booked change %", b.changePct, 117);
    check("Booked — KI only", await dash.bookedTotal({ tenantId, entityId: ki }, period), "90000");
  });

  it("Collected (verified) — minus verified refunds", async () => {
    check("Collected (verified)", await dash.collectedVerified(all(), period), "83000");
  });

  it("Awaiting verification + Cash with staff", async () => {
    check("Awaiting verification", await dash.awaitingVerification(all()), { value: "10000", count: 1 });
    const cash = await dash.cashWithStaff(all());
    check("Cash with staff", { value: cash.value, people: cash.people.map((p) => [p.name, p.amount]) }, { value: "10000", people: [["Viji", "10000"]] });
  });

  it("Outstanding, overdue + aging, refunds due", async () => {
    const o = await dash.outstanding(all(), NOW);
    check("Outstanding", [o.value, o.count], ["115000", 5]);
    check("Overdue", [o.overdue, o.overdueCount], ["75000", 3]);
    check("Aging 0–15 / 16–30 / 31–60 / 60+", o.aging.map((a) => a.amount), ["20000", "0", "40000", "15000"]);
    check("Refunds due", [o.refundsDue, o.refundsDueCount], ["3000", 1]);
    check("Outstanding — KI only", (await dash.outstanding({ tenantId, entityId: ki }, NOW)).value, "60000");
  });

  it("Stuck orders, pending approvals", async () => {
    const s = await dash.stuckOrders(all(), NOW);
    check("Stuck orders", s.list.map((x) => [x.number, x.ageDays]), [["T/1", 15]]);
    check("Pending approvals", await dash.pendingApprovals(all()), 1);
  });

  it("Sales leaderboard", async () => {
    const lb = await dash.salesLeaderboard(all(), period);
    check(
      "Leaderboard [name, booked, target, %, orders, avg, collected]",
      lb.map((r) => [r.name, r.booked, r.target, r.pct, r.orders, r.avgOrder, r.collected]),
      [
        ["Viji", "80000", "100000", 80, 2, "40000", "23000"],
        ["Naren", "50000", "0", null, 2, "25000", "60000"],
      ],
    );
  });

  it("Booked trend (12 months)", async () => {
    const t = await dash.bookedTrend(all(), NOW);
    check("Trend months", [t[0]!.month, t[11]!.month], ["2025-11", "2026-10"]);
    check("Trend non-zero", t.filter((m) => m.booked !== "0").map((m) => [m.month, m.booked]), [["2025-12", "15000"], ["2026-09", "60000"], ["2026-10", "130000"]]);
  });

  it("Top products, top customers, cancellations", async () => {
    const p = await dash.topProducts(all(), period);
    check("Top products by qty", p.byQty.map((x) => [x.name, x.qty]), [["Grinder A", 3], ["SS table", 3], ["Peeler", 1]]);
    check("Top products by value", p.byValue.map((x) => [x.name, x.value]), [["Grinder A", "90000"], ["Peeler", "30000"], ["SS table", "10000"]]);
    const c = await dash.topCustomers(all(), period);
    check("Top customers", c.top.map((x) => [x.name, x.booked]), [["Gokul", "80000"], ["Rew", "40000"], ["Mathews", "10000"]]);
    check("Repeat customers (≥ 2 orders)", c.repeatCustomers, 2);
    const x = await dash.cancellations(all(), period);
    check("Cancellations [count, value]", [x.count, x.value], [3, "53000"]);
    check("Cancellations by reason", x.reasons.map((r) => [r.reason, r.count, r.value]), [["PRICE", 1, "25000"], ["DELIVERY_DELAY", 1, "20000"], ["FINANCIAL_ISSUE", 1, "8000"]]);
  });

  it("adminDashboard bundles it all", async () => {
    const a = await dash.adminDashboard(all(), period, NOW);
    check("Needs action", a.needsAction, { approvals: 1, toVerify: 1, stuck: 1, cancelRequests: 0, refundsDue: 1 });
  });
});
