// §17-P4: partial dispatch → delivered → closed, guards, concurrency, hand-over,
// and the Dispatch-role DTO containing no money fields (JSON key snapshot).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  startProduction,
  markReady,
  createDispatch,
  markDelivered,
  handOverNow,
} from "@/server/services/dispatchService";
import { recordPayment, verifyPayments } from "@/server/services/paymentService";
import { getDispatchBoard, getDispatchOrder } from "@/server/repo/dispatchBoard";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) || process.env.SB_INTEGRATION_TESTS === "1");

const MONEY = /price|total|balance|amount|discount|charge|gst|payment|paid|refund/i;

function allKeys(v: unknown, path = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, `${path}[]`, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      const key = path ? `${path}.${k}` : k;
      out.add(key);
      allKeys(x, key, out);
    }
  }
  return out;
}

describe.skipIf(!DB_READY)("P4 — dispatch flow + Dispatch-role DTO", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let entityId = "";
  let ownerId = "";
  let dispatchId = "";
  let salesId = "";
  let customerId = "";
  let bank = "";
  let seq = 0;
  // IST calendar date (the app's day boundary) — a UTC date is a day behind
  // between 00:00 and 05:30 IST and made this test flaky overnight.
  const today = () =>
    new Date(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()) + "T00:00:00.000Z",
    );

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({
      data: { slug: `test-dsp-${stamp}`, name: "dispatch", settings: { create: { productionAlertDays: 10 } } },
    })).id;
    entityId = (await prisma.billingEntity.create({ data: { tenantId, code: `D${stamp.slice(-5)}`, name: "Dispatch Co" } })).id;
    bank = (await prisma.account.create({ data: { tenantId, entityId, label: "D Bank", kind: "BANK" } })).id;
    const u = (tag: string, role: "OWNER" | "DISPATCH" | "SALES", phone: string) =>
      prisma.user.create({ data: { tenantId, authUserId: `dsp-${stamp}:${tag}`, name: tag, phoneE164: phone, role } });
    ownerId = (await u("Owner", "OWNER", "+919999995001")).id;
    dispatchId = (await u("Workshop", "DISPATCH", "+919999995002")).id;
    salesId = (await u("Sales", "SALES", "+919999995003")).id;
    customerId = (await prisma.customer.create({ data: { tenantId, phoneE164: "+919999995100", name: "Swaada Foods", city: "Salem" } })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.dispatchLine.deleteMany({ where: { dispatch: { order: { tenantId } } } });
    await prisma.dispatch.deleteMany({ where: { order: { tenantId } } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.orderEvent.deleteMany({ where: { order: { tenantId } } });
    await prisma.orderLine.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.documentCounter.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.account.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  async function order(opts: { status?: "CONFIRMED" | "READY"; daysOld?: number; promisedInDays?: number } = {}) {
    seq += 1;
    const day = (n: number) => new Date(today().getTime() + n * 86_400_000); // IST date ± n days
    return prisma.order.create({
      data: {
        tenantId, number: `D/26-27/${String(seq).padStart(4, "0")}`, entityId, customerId, salespersonId: salesId,
        orderDate: day(-(opts.daysOld ?? 0)), status: opts.status ?? "CONFIRMED",
        promisedDeliveryDate: opts.promisedInDays === undefined ? null : day(opts.promisedInDays),
        subtotal: "100000", chargesTotal: "0", discount: "0", total: "100000", balanceDue: "100000", createdById: ownerId,
        lines: { create: [
          { description: "10L Tilting Wet Grinder", qty: 17, unitPrice: "5000", gstRate: "18", lineTotal: "85000", sortOrder: 0 },
          { description: "Vada machine", qty: 2, unitPrice: "7500", gstRate: "18", lineTotal: "15000", sortOrder: 1 },
        ] },
      },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
  }
  const D = () => ({ tenantId, actorId: dispatchId, actorRole: "DISPATCH" as const });
  const status = async (id: string) => (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

  it("partial dispatch → delivered → auto-CLOSED when fully paid (§17-P4 gate)", async () => {
    const o = await order();
    const p = await recordPayment({ tenantId, actorId: ownerId, actorRole: "OWNER", orderId: o.id, method: "UPI", amount: "100000", paidOn: new Date(), receivedIntoAccountId: bank });
    await verifyPayments({ tenantId, actorId: ownerId, actorRole: "OWNER", paymentIds: [p.paymentId] });
    const steps: string[] = [];
    const log = async (label: string) => steps.push(`${label} → ${await status(o.id)}`);

    await startProduction({ ...D(), orderId: o.id }); await log("start");
    await markReady({ ...D(), orderId: o.id }); await log("ready");
    const d1 = await createDispatch({ ...D(), orderId: o.id, dispatchedOn: today(), picks: [{ orderLineId: o.lines[0]!.id, qty: 5 }], transporter: "ABT", lrNumber: "88213" });
    await log("dispatch 5/17 grinders");
    const d2 = await createDispatch({ ...D(), orderId: o.id, dispatchedOn: today(), picks: [{ orderLineId: o.lines[0]!.id, qty: 12 }, { orderLineId: o.lines[1]!.id, qty: 2 }] });
    await log("dispatch remaining 12 + 2");
    await markDelivered({ ...D(), dispatchId: d1.dispatchId, deliveredOn: today() }); await log("first lot delivered");
    await markDelivered({ ...D(), dispatchId: d2.dispatchId, deliveredOn: today() }); await log("second lot delivered");

    console.log(steps.map((s) => `[P4-gate] ${s}`).join("\n"));
    expect(steps).toEqual([
      "start → IN_PRODUCTION",
      "ready → READY",
      "dispatch 5/17 grinders → PARTIALLY_DISPATCHED",
      "dispatch remaining 12 + 2 → DISPATCHED",
      "first lot delivered → DISPATCHED",
      "second lot delivered → CLOSED",
    ]);
    const lines = await prisma.orderLine.findMany({ where: { orderId: o.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => l.dispatchedQty)).toEqual([17, 2]);
    const events = await prisma.orderEvent.findMany({ where: { orderId: o.id }, orderBy: { at: "asc" } });
    expect(events.filter((e) => e.type === "STATUS_CHANGE").map((e) => e.toStatus)).toEqual([
      "IN_PRODUCTION", "READY", "PARTIALLY_DISPATCHED", "DISPATCHED", "DELIVERED", "CLOSED",
    ]);
  });

  it("delivered with balance due stays DELIVERED", async () => {
    const o = await order({ status: "READY" });
    const d = await createDispatch({ ...D(), orderId: o.id, dispatchedOn: today(), picks: [{ orderLineId: o.lines[0]!.id, qty: 17 }, { orderLineId: o.lines[1]!.id, qty: 2 }] });
    expect((await markDelivered({ ...D(), dispatchId: d.dispatchId, deliveredOn: today() })).status).toBe("DELIVERED");
  });

  it("guards: wrong status, over-dispatch, future dates, photos, double delivery, Sales", async () => {
    const o = await order();
    const pick = [{ orderLineId: o.lines[1]!.id, qty: 1 }];
    await expect(createDispatch({ ...D(), orderId: o.id, dispatchedOn: today(), picks: pick })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(markReady({ ...D(), orderId: o.id })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(startProduction({ tenantId, actorId: salesId, actorRole: "SALES", orderId: o.id })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const r = await order({ status: "READY" });
    await expect(createDispatch({ ...D(), orderId: r.id, dispatchedOn: today(), picks: [{ orderLineId: r.lines[1]!.id, qty: 3 }] })).rejects.toThrow(/Only 2 left/);
    await expect(createDispatch({ ...D(), orderId: r.id, dispatchedOn: new Date(Date.now() + 3 * 86_400_000), picks: pick.map((p) => ({ ...p, orderLineId: r.lines[1]!.id })) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createDispatch({ ...D(), orderId: r.id, dispatchedOn: today(), picks: [{ orderLineId: r.lines[1]!.id, qty: 1 }], photoPaths: [`${tenantId}/other/x.jpg`] })).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await createDispatch({ ...D(), orderId: r.id, dispatchedOn: today(), picks: [{ orderLineId: r.lines[1]!.id, qty: 1 }], photoPaths: [`${tenantId}/${r.id}/a.jpg`] });
    await markDelivered({ ...D(), dispatchId: ok.dispatchId, deliveredOn: today() });
    await expect(markDelivered({ ...D(), dispatchId: ok.dispatchId, deliveredOn: today() })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await status(r.id)).toBe("PARTIALLY_DISPATCHED");
  });

  it("concurrent dispatches of the same remaining qty: exactly one wins", async () => {
    const o = await order({ status: "READY" });
    const all = [{ orderLineId: o.lines[0]!.id, qty: 17 }, { orderLineId: o.lines[1]!.id, qty: 2 }];
    const results = await Promise.allSettled([1, 2, 3].map(() => createDispatch({ ...D(), orderId: o.id, dispatchedOn: today(), picks: all })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lines = await prisma.orderLine.findMany({ where: { orderId: o.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => l.dispatchedQty)).toEqual([17, 2]);
  });

  it("hand over now: CONFIRMED → DELIVERED in one tap", async () => {
    const o = await order();
    expect((await handOverNow({ ...D(), orderId: o.id, today: today() })).status).toBe("DELIVERED");
    const d = await prisma.dispatch.findMany({ where: { orderId: o.id }, include: { lines: true } });
    expect(d).toHaveLength(1);
    expect(d[0]!.deliveredOn).not.toBeNull();
    await expect(handOverNow({ ...D(), orderId: o.id, today: today() })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("Dispatch-role DTOs contain no money fields (JSON snapshot)", async () => {
    const o = await order({ status: "READY", daysOld: 12, promisedInDays: -2 });
    await createDispatch({ ...D(), orderId: o.id, dispatchedOn: today(), picks: [{ orderLineId: o.lines[0]!.id, qty: 5 }], transporter: "ABT", lrNumber: "1" });
    const dto = await getDispatchOrder(tenantId, o.id);
    const json = JSON.parse(JSON.stringify(dto));
    const keys = [...allKeys(json)].sort();
    expect(keys.filter((k) => MONEY.test(k))).toEqual([]);
    expect(keys).toMatchInlineSnapshot(`
      [
        "customer",
        "customer.city",
        "customer.name",
        "customer.phoneE164",
        "dispatches",
        "dispatches[].deliveredOn",
        "dispatches[].dispatchedOn",
        "dispatches[].id",
        "dispatches[].lines",
        "dispatches[].lines[].orderLineId",
        "dispatches[].lines[].qty",
        "dispatches[].lrNumber",
        "dispatches[].note",
        "dispatches[].photoCount",
        "dispatches[].transporter",
        "dispatches[].vehicleNo",
        "id",
        "lines",
        "lines[].description",
        "lines[].dispatchedQty",
        "lines[].id",
        "lines[].qty",
        "notes",
        "number",
        "orderDate",
        "promisedDeliveryDate",
        "salespersonName",
        "status",
      ]
    `);
    console.log(`[P4-dto] ${JSON.stringify(json, null, 2)}`);

    const board = await getDispatchBoard({ tenantId });
    const boardKeys = [...allKeys(JSON.parse(JSON.stringify(board)))];
    expect(boardKeys.filter((k) => MONEY.test(k))).toEqual([]);
    const cards = Object.values(board.columns).flat();
    expect(cards.filter((c) => c.gold)).toHaveLength(1);
    const card = cards.find((c) => c.id === o.id)!;
    expect(card).toMatchObject({ column: "READY", stuck: true, late: true, daysLate: 2, machines: 19, remaining: 14 });
  });
});
