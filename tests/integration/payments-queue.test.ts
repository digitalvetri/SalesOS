// P3-C: verify queue + cash-with-staff read models, and the deposit/refund guards.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  recordPayment,
  verifyPayments,
  rejectPayment,
  markDeposited,
  recordRefund,
} from "@/server/services/paymentService";
import { cancelOrder } from "@/server/services/orderService";
import { listVerifyQueue, listCashWithStaff } from "@/server/repo/payments";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_READY)("P3-C — verify queue, cash with staff, deposit + refund guards", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let entityId = "";
  let ownerId = "";
  let naren = "";
  let viji = "";
  let customerId = "";
  let bank = "";
  let upi = "";
  let seq = 0;

  beforeAll(async () => {
    const t = await prisma.tenant.create({
      data: { slug: `test-pq-${stamp}`, name: "payments-queue", settings: { create: {} } },
    });
    tenantId = t.id;
    entityId = (
      await prisma.billingEntity.create({
        data: { tenantId, code: `Q${stamp.slice(-5)}`, name: "Queue Test" },
      })
    ).id;
    bank = (await prisma.account.create({ data: { tenantId, entityId, label: "Q Bank", kind: "BANK" } })).id;
    upi = (await prisma.account.create({ data: { tenantId, entityId, label: "Q UPI", kind: "UPI" } })).id;
    const user = (tag: string, role: "OWNER" | "SALES", phone: string) =>
      prisma.user.create({
        data: { tenantId, authUserId: `pq-${stamp}:${tag}`, name: tag, phoneE164: phone, role, canReceivePayments: role === "SALES" },
      });
    ownerId = (await user("Owner", "OWNER", "+919999997001")).id;
    naren = (await user("Naren", "SALES", "+919999997002")).id;
    viji = (await user("Viji", "SALES", "+919999997003")).id;
    customerId = (
      await prisma.customer.create({ data: { tenantId, phoneE164: "+919999997100", name: "Q Customer" } })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.orderEvent.deleteMany({ where: { order: { tenantId } } });
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

  async function order(salespersonId: string, total = "100000") {
    seq += 1;
    return prisma.order.create({
      data: {
        tenantId,
        number: `Q/26-27/${String(seq).padStart(4, "0")}`,
        entityId,
        customerId,
        salespersonId,
        orderDate: new Date(),
        status: "CONFIRMED",
        subtotal: total,
        chargesTotal: "0",
        discount: "0",
        total,
        balanceDue: total,
        createdById: ownerId,
      },
    });
  }
  const pay = (orderId: string, actorId: string, amount: string, into: { acc?: string; user?: string }, method: "CASH" | "UPI" = "UPI") =>
    recordPayment({
      tenantId, actorId, actorRole: "SALES", orderId, method, amount, paidOn: new Date(),
      receivedIntoAccountId: into.acc ?? null, receivedByUserId: into.user ?? null,
    });

  it("queue lists pending payments with totals and honours filters", async () => {
    const o1 = await order(naren);
    const o2 = await order(viji);
    const a = await pay(o1.id, naren, "10000", { acc: bank });
    const b = await pay(o1.id, naren, "5000", { user: naren }, "CASH");
    const c = await pay(o2.id, viji, "20000", { acc: upi });

    const all = await listVerifyQueue({ tenantId, filters: {} });
    expect(all.count).toBe(3);
    expect(all.total).toBe("35000");
    expect(all.rows.map((r) => r.receiptNo)).toEqual([a.receiptNo, b.receiptNo, c.receiptNo]);
    const cashRow = all.rows.find((r) => r.id === b.paymentId)!;
    expect(cashRow.into).toMatchObject({ kind: "person", label: "Naren" });
    expect(cashRow.salesperson.name).toBe("Naren");

    expect((await listVerifyQueue({ tenantId, filters: { method: "CASH" } })).count).toBe(1);
    expect((await listVerifyQueue({ tenantId, filters: { receivedInto: `account:${upi}` } })).count).toBe(1);
    expect((await listVerifyQueue({ tenantId, filters: { receivedInto: `user:${naren}` } })).count).toBe(1);
    expect((await listVerifyQueue({ tenantId, filters: { salespersonId: viji } })).count).toBe(1);

    await verifyPayments({ tenantId, actorRole: "OWNER" as const, actorId: ownerId, paymentIds: [a.paymentId] });
    await rejectPayment({ tenantId, actorRole: "OWNER" as const, actorId: ownerId, paymentId: c.paymentId, reason: "UTR not found" });
    const after = await listVerifyQueue({ tenantId, filters: {} });
    expect(after.rows.map((r) => r.id)).toEqual([b.paymentId]);
  });

  it("cash with staff groups undeposited personal receipts and drops deposited/rejected ones", async () => {
    const o = await order(viji);
    const p1 = await pay(o.id, viji, "3000", { user: viji }, "CASH");
    const p2 = await pay(o.id, viji, "2000", { user: viji }, "CASH");
    const p3 = await pay(o.id, viji, "1000", { user: viji }, "CASH");
    await rejectPayment({ tenantId, actorRole: "OWNER" as const, actorId: ownerId, paymentId: p3.paymentId, reason: "duplicate" });

    let groups = await listCashWithStaff(tenantId);
    const vg = groups.find((g) => g.user.id === viji)!;
    expect(vg.total).toBe("5000");
    expect(vg.payments.map((p) => p.id)).toEqual([p1.paymentId, p2.paymentId]);

    await markDeposited({ tenantId, actorRole: "OWNER" as const, actorId: ownerId, paymentId: p1.paymentId, depositedToAccountId: bank, depositedOn: new Date() });
    groups = await listCashWithStaff(tenantId);
    expect(groups.find((g) => g.user.id === viji)!.total).toBe("2000");
  });

  it("markDeposited refuses rejected, already-deposited, account-only, future-dated and foreign-account cases", async () => {
    const o = await order(naren);
    const cash = await pay(o.id, naren, "1500", { user: naren }, "CASH");
    const viaBank = await pay(o.id, naren, "1500", { acc: bank });
    const rejected = await pay(o.id, naren, "500", { user: naren }, "CASH");
    await rejectPayment({ tenantId, actorRole: "OWNER" as const, actorId: ownerId, paymentId: rejected.paymentId, reason: "x" });
    const base = { tenantId, actorRole: "OWNER" as "OWNER" | "SALES", actorId: ownerId, depositedToAccountId: bank, depositedOn: new Date() };

    await expect(markDeposited({ ...base, paymentId: rejected.paymentId })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(markDeposited({ ...base, paymentId: viaBank.paymentId })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      markDeposited({ ...base, paymentId: cash.paymentId, depositedOn: new Date(Date.now() + 3 * 86_400_000) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      markDeposited({ ...base, paymentId: cash.paymentId, depositedToAccountId: "not-an-account" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      markDeposited({ ...base, actorRole: "SALES", actorId: naren, paymentId: cash.paymentId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await markDeposited({ ...base, paymentId: cash.paymentId });
    await expect(markDeposited({ ...base, paymentId: cash.paymentId })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refund is capped at the refund due and needs a company account", async () => {
    const o = await order(naren, "40000");
    const adv = await pay(o.id, naren, "15000", { acc: bank });
    await verifyPayments({ tenantId, actorRole: "OWNER" as const, actorId: ownerId, paymentIds: [adv.paymentId] });

    const refund = { tenantId, actorRole: "OWNER" as const, actorId: ownerId, orderId: o.id, method: "BANK_TRANSFER" as const, paidOn: new Date() };
    // Nothing due back while the order is live.
    await expect(recordRefund({ ...refund, amount: "100", receivedIntoAccountId: bank })).rejects.toMatchObject({ code: "VALIDATION" });

    await cancelOrder({ tenantId, actorId: ownerId, actorRole: "OWNER", id: o.id, reason: "PRICE", note: null });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).balanceDue.toString()).toBe("-15000");

    await expect(recordRefund({ ...refund, amount: "15002", receivedIntoAccountId: bank })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordRefund({ ...refund, amount: "15000", receivedIntoAccountId: null })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(recordRefund({ ...refund, amount: "15000", receivedIntoAccountId: "nope" })).rejects.toMatchObject({ code: "VALIDATION" });

    await recordRefund({ ...refund, amount: "15000", receivedIntoAccountId: bank });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).balanceDue.toString()).toBe("0");
    const queue = await listVerifyQueue({ tenantId, filters: {} });
    expect(queue.rows.some((r) => r.order.id === o.id && r.type === "REFUND")).toBe(true);
  });
});
