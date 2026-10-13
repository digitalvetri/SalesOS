// P3-B: guards on recordPayment that the §11.5 sheet relies on — inferred
// payment type, receiver must belong to the tenant, no future dates, proof
// paths minted for this order only, nothing recorded on a cancelled order.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { recordPayment } from "@/server/services/paymentService";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55433\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_READY)("P3-B — recordPayment guards", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantIds: string[] = [];
  let tenantId = "";
  let entityId = "";
  let ownerId = "";
  let salesId = "";
  let noReceiveId = "";
  let customerId = "";
  let accountId = "";
  let foreignAccountId = "";
  let seq = 0;

  async function makeTenant(tag: string) {
    const t = await prisma.tenant.create({
      data: { slug: `test-rpg-${tag}-${stamp}`, name: `rpg ${tag}`, settings: { create: {} } },
    });
    tenantIds.push(t.id);
    const e = await prisma.billingEntity.create({
      data: { tenantId: t.id, code: `R${tag}${stamp.slice(-4)}`, name: `RPG ${tag}` },
    });
    const a = await prisma.account.create({
      data: { tenantId: t.id, entityId: e.id, label: `Bank ${tag}`, kind: "BANK" },
    });
    return { tenantId: t.id, entityId: e.id, accountId: a.id };
  }

  beforeAll(async () => {
    const main = await makeTenant("a");
    ({ tenantId, entityId, accountId } = main);
    foreignAccountId = (await makeTenant("b")).accountId;

    const mk = (tag: string, role: "OWNER" | "SALES", canReceivePayments: boolean, phone: string) =>
      prisma.user.create({
        data: {
          tenantId,
          authUserId: `rpg-${stamp}:${tag}`,
          name: `RPG ${tag}`,
          phoneE164: phone,
          role,
          canReceivePayments,
        },
      });
    ownerId = (await mk("owner", "OWNER", false, "+919999998001")).id;
    salesId = (await mk("sales", "SALES", true, "+919999998002")).id;
    noReceiveId = (await mk("dispatch", "SALES", false, "+919999998003")).id;
    customerId = (
      await prisma.customer.create({
        data: { tenantId, phoneE164: "+919999998100", name: "RPG Customer" },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    for (const id of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.payment.deleteMany({ where: { tenantId: id } });
      await prisma.orderEvent.deleteMany({ where: { order: { tenantId: id } } });
      await prisma.order.deleteMany({ where: { tenantId: id } });
      await prisma.documentCounter.deleteMany({ where: { tenantId: id } });
      await prisma.customer.deleteMany({ where: { tenantId: id } });
      await prisma.user.deleteMany({ where: { tenantId: id } });
      await prisma.account.deleteMany({ where: { tenantId: id } });
      await prisma.billingEntity.deleteMany({ where: { tenantId: id } });
      await prisma.tenantSettings.delete({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id } });
    }
    await prisma.$disconnect();
  }, 60_000);

  async function order(status: "CONFIRMED" | "CANCELLED" = "CONFIRMED", total = "24000") {
    seq += 1;
    return prisma.order.create({
      data: {
        tenantId,
        number: `RPG/26-27/${String(seq).padStart(4, "0")}`,
        entityId,
        customerId,
        salespersonId: salesId,
        orderDate: new Date(),
        status,
        subtotal: total,
        chargesTotal: "0",
        discount: "0",
        total,
        balanceDue: total,
        createdById: ownerId,
      },
    });
  }

  const base = () => ({
    tenantId,
    actorId: salesId,
    actorRole: "SALES" as const,
    method: "UPI" as const,
    paidOn: new Date(),
  });

  it("infers ADVANCE → PART → FINAL as the balance is paid down", async () => {
    const o = await order();
    const a = await recordPayment({ ...base(), orderId: o.id, amount: "10000", receivedIntoAccountId: accountId });
    const b = await recordPayment({ ...base(), orderId: o.id, amount: "4000", receivedByUserId: salesId });
    const c = await recordPayment({ ...base(), orderId: o.id, amount: "10000", receivedIntoAccountId: accountId });
    expect([a.type, b.type, c.type]).toEqual(["ADVANCE", "PART", "FINAL"]);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id } });
    expect(after.balanceDue.toString()).toBe("0");
  });

  it("refuses an account from another tenant", async () => {
    const o = await order();
    await expect(
      recordPayment({ ...base(), orderId: o.id, amount: "100", receivedIntoAccountId: foreignAccountId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a person who cannot receive payments", async () => {
    const o = await order();
    await expect(
      recordPayment({ ...base(), orderId: o.id, amount: "100", receivedByUserId: noReceiveId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a future payment date", async () => {
    const o = await order();
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    await expect(
      recordPayment({ ...base(), orderId: o.id, amount: "100", paidOn: future, receivedIntoAccountId: accountId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses a proof path minted for a different order", async () => {
    const o = await order();
    const other = await order();
    await expect(
      recordPayment({
        ...base(),
        orderId: o.id,
        amount: "100",
        receivedIntoAccountId: accountId,
        proofPath: `${tenantId}/${other.id}/abc.jpg`,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await recordPayment({
      ...base(),
      orderId: o.id,
      amount: "100",
      receivedIntoAccountId: accountId,
      proofPath: `${tenantId}/${o.id}/abc.jpg`,
    });
    const row = await prisma.payment.findUniqueOrThrow({ where: { id: ok.paymentId } });
    expect(row.proofPath).toBe(`${tenantId}/${o.id}/abc.jpg`);
  });

  it("refuses payments on a cancelled order", async () => {
    const o = await order("CANCELLED");
    await expect(
      recordPayment({ ...base(), orderId: o.id, amount: "100", receivedIntoAccountId: accountId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("refuses Sales recording on someone else's order", async () => {
    const o = await order();
    await expect(
      recordPayment({ ...base(), actorId: noReceiveId, orderId: o.id, amount: "100", receivedIntoAccountId: accountId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
