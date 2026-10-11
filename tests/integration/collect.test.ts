// P3-D: Collect view (§11.6 + §5.4 overdue) and follow-ups / promised dates.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getCollectView } from "@/server/repo/collect";
import { logReminder, logContact, setPromisedPaymentDate } from "@/server/services/followUpService";
import { addDays } from "@/server/domain/payment/collect";
import { istDateString } from "@/server/domain/payment/record";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_READY)("P3-D — Collect + follow-ups", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const today = istDateString(new Date());
  const day = (offset: number) => new Date(`${addDays(today, offset)}T00:00:00.000Z`);
  let tenantId = "";
  let entityId = "";
  let ownerId = "";
  let mine = "";
  let other = "";
  let dispatchId = "";
  let rew = "";
  let gokul = "";
  let seq = 0;
  const ids: Record<string, string> = {};

  async function order(tag: string, opts: {
    customerId: string; salespersonId: string; balance: string;
    promised?: number | null; status?: "CONFIRMED" | "DELIVERED" | "CANCELLED"; deliveredDaysAgo?: number;
  }) {
    seq += 1;
    const o = await prisma.order.create({
      data: {
        tenantId, number: `C/26-27/${String(seq).padStart(4, "0")}`, entityId,
        customerId: opts.customerId, salespersonId: opts.salespersonId, orderDate: day(-30),
        status: opts.status ?? "CONFIRMED", subtotal: "50000", chargesTotal: "0", discount: "0",
        total: "50000", balanceDue: opts.balance,
        promisedPaymentDate: opts.promised === undefined || opts.promised === null ? null : day(opts.promised),
        createdById: ownerId,
      },
    });
    if (opts.deliveredDaysAgo !== undefined) {
      await prisma.orderEvent.create({
        data: {
          orderId: o.id, actorId: ownerId, type: "STATUS_CHANGE", fromStatus: "DISPATCHED", toStatus: "DELIVERED",
          at: new Date(Date.now() - opts.deliveredDaysAgo * 86_400_000),
        },
      });
    }
    ids[tag] = o.id;
    return o;
  }

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({
      data: { slug: `test-col-${stamp}`, name: "collect", settings: { create: { overdueGraceDays: 7 } } },
    })).id;
    entityId = (await prisma.billingEntity.create({ data: { tenantId, code: `C${stamp.slice(-5)}`, name: "Kumaar Industries" } })).id;
    const user = (tag: string, role: "OWNER" | "SALES" | "DISPATCH", phone: string) =>
      prisma.user.create({ data: { tenantId, authUserId: `col-${stamp}:${tag}`, name: tag, phoneE164: phone, role } });
    ownerId = (await user("Owner", "OWNER", "+919999996001")).id;
    mine = (await user("Viji", "SALES", "+919999996002")).id;
    other = (await user("Naren", "SALES", "+919999996003")).id;
    dispatchId = (await user("Disp", "DISPATCH", "+919999996004")).id;
    rew = (await prisma.customer.create({ data: { tenantId, phoneE164: "+919999996101", name: "Rew" } })).id;
    gokul = (await prisma.customer.create({ data: { tenantId, phoneE164: "+919999996102", name: "Gokul" } })).id;

    await order("promisedPast", { customerId: rew, salespersonId: mine, balance: "10000", promised: -18 });
    await order("deliveredLate", { customerId: rew, salespersonId: mine, balance: "17010", status: "DELIVERED", deliveredDaysAgo: 10 });
    await order("promisedToday", { customerId: gokul, salespersonId: mine, balance: "14000", promised: 0 });
    await order("promisedSoon", { customerId: gokul, salespersonId: other, balance: "5000", promised: 3 });
    await order("noDate", { customerId: gokul, salespersonId: mine, balance: "2000" });
    await order("cancelled", { customerId: rew, salespersonId: mine, balance: "9999", status: "CANCELLED" });
    await order("paid", { customerId: rew, salespersonId: mine, balance: "0" });
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.followUp.deleteMany({ where: { order: { tenantId } } });
    await prisma.orderEvent.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  it("computes outstanding, chip counts and overdue groups (admin view)", async () => {
    const v = await getCollectView({ tenantId, filter: "all" });
    expect(v.outstanding).toBe("48010");
    expect(v.counts).toEqual({ all: 5, overdue: 2, week: 2, today: 1 });
    // Overdue customer first.
    expect(v.groups.map((g) => g.customer.name)).toEqual(["Rew", "Gokul"]);
    const r = v.groups[0]!;
    expect(r.total).toBe("27010");
    expect(r.maxDaysOverdue).toBe(18);
    const late = r.orders.find((o) => o.id === ids.deliveredLate)!;
    expect(late).toMatchObject({ overdue: true, daysOverdue: 3 });
    const g = v.groups[1]!;
    expect(g.orders.find((o) => o.id === ids.noDate)).toMatchObject({ overdue: false, dueOn: null });
  });

  it("filters and scopes Sales to their own orders", async () => {
    const overdue = await getCollectView({ tenantId, filter: "overdue" });
    expect(overdue.groups.flatMap((g) => g.orders.map((o) => o.id)).sort()).toEqual([ids.deliveredLate, ids.promisedPast].sort());
    const week = await getCollectView({ tenantId, filter: "week", salespersonScope: mine });
    expect(week.groups.flatMap((g) => g.orders.map((o) => o.id))).toEqual([ids.promisedToday]);
    const mineAll = await getCollectView({ tenantId, filter: "all", salespersonScope: mine });
    expect(mineAll.outstanding).toBe("43010");
  });

  it("reminders: logged, then blocked for 48 h, then allowed again", async () => {
    const base = { tenantId, actorId: mine, actorRole: "SALES" as const, orderIds: [ids.promisedPast!, ids.deliveredLate!] };
    expect(await logReminder(base)).toEqual({ count: 2 });
    await expect(logReminder({ ...base, orderIds: [ids.promisedPast!] })).rejects.toMatchObject({ code: "CONFLICT" });

    const v = await getCollectView({ tenantId, filter: "all" });
    const rewGroup = v.groups.find((g) => g.customer.name === "Rew")!;
    expect(rewGroup.orders.every((o) => o.reminderBlockedUntil !== null)).toBe(true);
    expect(rewGroup.lastFollowUp?.channel).toBe("WHATSAPP");

    const later = new Date(Date.now() + 49 * 3_600_000);
    expect(await logReminder({ ...base, orderIds: [ids.promisedPast!], now: later })).toEqual({ count: 1 });
  });

  it("refuses Sales on another's order and Dispatch entirely", async () => {
    await expect(
      logReminder({ tenantId, actorId: mine, actorRole: "SALES", orderIds: [ids.promisedSoon!] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      logContact({ tenantId, actorId: dispatchId, actorRole: "DISPATCH", orderIds: [ids.noDate!], channel: "CALL" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await logContact({ tenantId, actorId: ownerId, actorRole: "OWNER", orderIds: [ids.promisedSoon!], channel: "CALL" })).toEqual({ count: 1 });
  });

  it("promised date: refuses the past, sets + logs, clears", async () => {
    const base = { tenantId, actorId: mine, actorRole: "SALES" as const, orderId: ids.noDate! };
    await expect(setPromisedPaymentDate({ ...base, promisedOn: day(-1) })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      setPromisedPaymentDate({ ...base, orderId: ids.cancelled!, promisedOn: day(2) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const res = await setPromisedPaymentDate({ ...base, promisedOn: day(2), note: "after Diwali" });
    expect(res.promisedPaymentDate).toBe(addDays(today, 2));
    const o = await prisma.order.findUniqueOrThrow({ where: { id: ids.noDate! }, include: { events: true, followUps: true } });
    expect(o.promisedPaymentDate?.toISOString().slice(0, 10)).toBe(addDays(today, 2));
    expect(o.events.some((e) => e.type === "NOTE" && e.note?.includes("after Diwali"))).toBe(true);
    expect(o.followUps.some((f) => f.channel === "OTHER")).toBe(true);
    const week = await getCollectView({ tenantId, filter: "week", salespersonScope: mine });
    expect(week.groups.flatMap((g) => g.orders.map((x) => x.id))).toContain(ids.noDate);

    await setPromisedPaymentDate({ ...base, promisedOn: null });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: ids.noDate! } })).promisedPaymentDate).toBeNull();
  });
});
