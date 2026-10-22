// Pre-deploy audit fixes (2026-10-12):
//  - a payment can't exceed the balance (Paid must stay = Σ payments, v1.1 §2)
//  - payment delete / total edit recompute from fresh rows
//  - re-marking DELIVERED keeps the original completedAt
//  - an ADMIN can't change an OWNER's login (email / password)
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  createOrderV2,
  addPaymentV2,
  deletePaymentV2,
  updateOrderFieldsV2,
  updatePaymentV2,
  setOrderStatusV2, setProductionStatusV2 } from "@/server/services/orderV2Service";
import { adminSetPassword, adminUpdateUserEmail, adminUpdateUser } from "@/server/services/userService";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_REACHABLE =
  Boolean(process.env.DATABASE_URL) &&
  (/:55433\b/.test(process.env.DATABASE_URL!) || process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_REACHABLE)("v1.1 order + user rules", () => {
  const prisma = new PrismaClient();
  const slug = `test-rules-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let salesId = "";
  let adminId = "";
  let ownerId = "";

  beforeAll(async () => {
    tenantId = (
      await prisma.tenant.create({ data: { slug, name: "order-v2-rules.test", settings: { create: {} } } })
    ).id;
    await prisma.billingEntity.create({
      data: { tenantId, code: `R${Date.now().toString().slice(-5)}`, name: "Rules Entity" },
    });
    const mk = (role: "SALES" | "ADMIN" | "OWNER", phone: string) =>
      prisma.user.create({
        data: { tenantId, authUserId: `${slug}:${role}`, name: `Rules ${role}`, phoneE164: phone, role },
      });
    salesId = (await mk("SALES", "+919999911001")).id;
    adminId = (await mk("ADMIN", "+919999911002")).id;
    ownerId = (await mk("OWNER", "+919999911003")).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.orderLine.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.documentCounter.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  async function newOrder(total: string, paid?: string) {
    const { order } = await createOrderV2({
      tenantId,
      actorId: salesId,
      salespersonId: salesId,
      productText: "Rules item",
      contactPhone: `+9199999${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`,
      customerName: "Rules customer",
      total,
      paid,
    });
    return order;
  }

  it("rejects a payment larger than the balance and keeps Paid = Σ payments", async () => {
    const order = await newOrder("100");
    await addPaymentV2({ tenantId, actorId: salesId, orderId: order.id, amount: "60", method: "UPI" });
    await expect(
      addPaymentV2({ tenantId, actorId: salesId, orderId: order.id, amount: "60", method: "UPI" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    const sum = await prisma.payment.aggregate({ where: { orderId: order.id }, _sum: { amount: true } });
    expect(after.paidTotal.toString()).toBe(sum._sum.amount!.toString());
    expect(after.balanceDue.toString()).toBe("40");
  });

  it("deleting a payment recomputes from the current paidTotal", async () => {
    const order = await newOrder("100");
    const p1 = await addPaymentV2({ tenantId, actorId: salesId, orderId: order.id, amount: "30", method: "CASH" });
    await addPaymentV2({ tenantId, actorId: salesId, orderId: order.id, amount: "20", method: "CASH" });
    await deletePaymentV2({ tenantId, actorId: adminId, actorRole: "ADMIN", paymentId: p1.id });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.paidTotal.toString()).toBe("20");
    expect(after.balanceDue.toString()).toBe("80");
  });

  it("editing the total recomputes the balance and refuses a total below Paid", async () => {
    const order = await newOrder("100", "40");
    await updateOrderFieldsV2({ tenantId, actorId: salesId, actorRole: "SALES", orderId: order.id, total: "150" });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.balanceDue.toString()).toBe("110");
    await expect(
      updateOrderFieldsV2({ tenantId, actorId: salesId, actorRole: "SALES", orderId: order.id, total: "30" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("re-marking DELIVERED keeps the original completion date", async () => {
    const order = await newOrder("100");
    await setOrderStatusV2({ tenantId, actorId: adminId, actorRole: "ADMIN", orderId: order.id, status: "DELIVERED" });
    const back = new Date("2026-09-15T00:00:00.000Z");
    await prisma.order.update({ where: { id: order.id }, data: { completedAt: back } });
    await setOrderStatusV2({ tenantId, actorId: adminId, actorRole: "ADMIN", orderId: order.id, status: "DELIVERED" });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.completedAt?.toISOString()).toBe(back.toISOString());
  });

  it("production Finished → sales deliver; production can't touch delivered orders", async () => {
    const order = await newOrder("100");
    await expect(
      setProductionStatusV2({ tenantId, actorId: salesId, actorRole: "SALES", orderId: order.id, status: "FINISHED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await setProductionStatusV2({ tenantId, actorId: adminId, actorRole: "PRODUCTION", orderId: order.id, status: "IN_PROGRESS" });
    await setProductionStatusV2({ tenantId, actorId: adminId, actorRole: "PRODUCTION", orderId: order.id, status: "FINISHED" });
    await setOrderStatusV2({ tenantId, actorId: salesId, actorRole: "SALES", orderId: order.id, status: "DELIVERED" });
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.productionStatus).toBe("FINISHED");
    await expect(
      setProductionStatusV2({ tenantId, actorId: adminId, actorRole: "PRODUCTION", orderId: order.id, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("sales may deliver before production finishes — the order becomes Ready stock", async () => {
    for (const start of ["NOT_STARTED", "IN_PROGRESS"] as const) {
      const order = await newOrder("100");
      if (start === "IN_PROGRESS") {
        await setProductionStatusV2({ tenantId, actorId: adminId, actorRole: "PRODUCTION", orderId: order.id, status: "IN_PROGRESS" });
      }
      await setOrderStatusV2({ tenantId, actorId: salesId, actorRole: "SALES", orderId: order.id, status: "DELIVERED" });
      const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.simpleStatus).toBe("DELIVERED");
      expect(after.productionStatus).toBe("NOT_NEEDED");
    }
  });

  it("a ready-stock order never goes to production", async () => {
    const { order } = await createOrderV2({
      tenantId,
      actorId: salesId,
      salespersonId: salesId,
      productText: "Stock item",
      contactPhone: "+919999911111",
      customerName: "Stock customer",
      total: "100",
      readyStock: true,
    });
    expect(order.productionStatus).toBe("NOT_NEEDED");
    await expect(
      setProductionStatusV2({ tenantId, actorId: adminId, actorRole: "PRODUCTION", orderId: order.id, status: "IN_PROGRESS" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("an itemised order saves its lines and the server's own total", async () => {
    const { order } = await createOrderV2({
      tenantId, actorId: salesId, salespersonId: salesId,
      productText: "", total: "1", // ignored when items are given
      contactPhone: "+919999922222", customerName: "Items customer",
      items: [
        { name: "Grinder", qty: 3, unitPrice: "1000" },
        { name: "Stand", qty: 1, unitPrice: "500" },
      ],
      paid: "1000",
    });
    expect(order.total.toFixed(2)).toBe("3500.00");
    expect(order.balanceDue.toFixed(2)).toBe("2500.00");
    expect(order.productText).toBe("Grinder × 3, Stand");
    const lines = await prisma.orderLine.findMany({ where: { orderId: order.id }, orderBy: { sortOrder: "asc" } });
    expect(lines.map((l) => [l.description, l.qty, l.lineTotal.toFixed(2)])).toEqual([["Grinder", 3, "3000.00"], ["Stand", 1, "500.00"]]);
  });

  it("a wrong advance can be corrected or deleted by the salesperson while the order is pending", async () => {
    const order = await newOrder("10000", "7000");
    const pay = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await updatePaymentV2({ tenantId, actorId: salesId, actorRole: "SALES", paymentId: pay.id, amount: "700" });
    let o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([o.paidTotal.toFixed(2), o.balanceDue.toFixed(2)]).toEqual(["700.00", "9300.00"]);
    await expect(
      updatePaymentV2({ tenantId, actorId: salesId, actorRole: "SALES", paymentId: pay.id, amount: "10001" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await deletePaymentV2({ tenantId, actorId: salesId, actorRole: "SALES", paymentId: pay.id });
    o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect([o.paidTotal.toFixed(2), o.balanceDue.toFixed(2)]).toEqual(["0.00", "10000.00"]);
  });

  it("after delivery only an admin can change payments", async () => {
    const order = await newOrder("1000", "400");
    const pay = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    await setOrderStatusV2({ tenantId, actorId: salesId, actorRole: "SALES", orderId: order.id, status: "DELIVERED" });
    await expect(
      updatePaymentV2({ tenantId, actorId: salesId, actorRole: "SALES", paymentId: pay.id, amount: "500" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await updatePaymentV2({ tenantId, actorId: adminId, actorRole: "ADMIN", paymentId: pay.id, amount: "500" });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.paidTotal.toFixed(2)).toBe("500.00");
  });

  it("an ADMIN can't change the OWNER's password, email or deactivate them", async () => {
    await expect(
      adminSetPassword({ tenantId, actorId: adminId, userId: ownerId, newPassword: "Something-long-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      adminUpdateUserEmail({ tenantId, actorId: adminId, userId: ownerId, email: "x@example.com" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      adminUpdateUser({ tenantId, actorId: adminId, actorRole: "ADMIN", userId: ownerId, active: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      adminUpdateUser({ tenantId, actorId: ownerId, actorRole: "OWNER", userId: ownerId, active: false }),
    ).rejects.toMatchObject({ code: "CONFLICT" }); // last active owner
  });
});
