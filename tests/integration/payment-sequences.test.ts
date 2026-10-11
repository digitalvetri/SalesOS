// §17-P3 gate: 12 scripted sequences through recordPayment / verifyPayments /
// rejectPayment / recordRefund / markDeposited, asserting the expected
// balanceDue + order status at every step.
//
// Each `step()` block pastes its expected vs actual values; the final
// `summary` is captured into docs/evidence/phase-3.md.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import Decimal from "decimal.js";
import { PrismaClient } from "@prisma/client";
import {
  recordPayment,
  verifyPayments,
  rejectPayment,
  recordRefund,
  markDeposited,
} from "@/server/services/paymentService";
import { cancelOrder } from "@/server/services/orderService";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) ||
    process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_READY)("§17-P3 gate — payment sequences (BR-09)", () => {
  const prisma = new PrismaClient();
  const slug = `test-pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let entityId = "";
  let actorId = "";
  let salespersonId = "";
  let customerId = "";
  let bankAccountId = "";

  beforeAll(async () => {
    const tenant = await prisma.tenant.create({
      data: { slug, name: "payment-sequences.test", settings: { create: {} } },
    });
    tenantId = tenant.id;
    const entity = await prisma.billingEntity.create({
      data: { tenantId, code: `P${Date.now().toString().slice(-5)}`, name: "Pay Test" },
    });
    entityId = entity.id;
    const bank = await prisma.account.create({
      data: { tenantId, entityId, label: "Test Bank", kind: "BANK" },
    });
    bankAccountId = bank.id;
    const owner = await prisma.user.create({
      data: {
        tenantId,
        authUserId: `${slug}:owner`,
        name: "Pay Owner",
        phoneE164: "+919999999011",
        role: "OWNER",
      },
    });
    actorId = owner.id;
    const sales = await prisma.user.create({
      data: {
        tenantId,
        authUserId: `${slug}:sales`,
        name: "Pay Sales",
        phoneE164: "+919999999012",
        role: "SALES",
        canReceivePayments: true,
      },
    });
    salespersonId = sales.id;
    const customer = await prisma.customer.create({
      data: { tenantId, phoneE164: "+919999900002", name: "Pay Customer" },
    });
    customerId = customer.id;
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
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

  // Fresh ₹1,00,000 order for each scenario (status overridable). The counter key
  // is stable within this suite so sequential calls get distinct numbers.
  async function freshOrder(opts?: { total?: string; status?: "CONFIRMED" | "DELIVERED" }) {
    const counter = await prisma.documentCounter.upsert({
      where: { tenantId_key: { tenantId, key: `TEST-PAY-SEQ` } },
      create: { tenantId, key: `TEST-PAY-SEQ`, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const total = opts?.total ?? "100000";
    const order = await prisma.order.create({
      data: {
        tenantId,
        number: `PAY/26-27/${String(counter.value).padStart(4, "0")}`,
        entityId,
        customerId,
        salespersonId,
        orderDate: new Date(),
        status: opts?.status ?? "CONFIRMED",
        subtotal: total,
        chargesTotal: "0",
        discount: "0",
        total,
        balanceDue: total,
        createdById: actorId,
      },
    });
    return order;
  }

  async function orderState(id: string) {
    const o = await prisma.order.findUnique({
      where: { id },
      select: { status: true, balanceDue: true },
    });
    return { status: o!.status, balanceDue: o!.balanceDue.toString() };
  }

  it("records every scenario correctly", async () => {
    const results: Array<{
      step: string;
      expectedBalance: string;
      expectedStatus: string;
      actualBalance: string;
      actualStatus: string;
    }> = [];
    async function step(
      name: string,
      orderId: string,
      expectedBalance: string,
      expectedStatus: string,
    ) {
      const s = await orderState(orderId);
      const row = {
        step: name,
        expectedBalance,
        expectedStatus,
        actualBalance: new Decimal(s.balanceDue).toString(),
        actualStatus: s.status,
      };
      results.push(row);
      expect(row.actualBalance).toBe(expectedBalance);
      expect(row.actualStatus).toBe(expectedStatus);
    }

    // ───────── 1 — Pending advance on a CONFIRMED order ─────────
    const o1 = await freshOrder();
    await recordPayment({
      tenantId, actorId, actorRole: "OWNER", orderId: o1.id,
      type: "ADVANCE", method: "UPI", amount: "20000", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    await step("1. pending advance ₹20,000", o1.id, "80000", "CONFIRMED");

    // ───────── 2 — Verify the advance ─────────
    const p1 = await prisma.payment.findFirstOrThrow({ where: { orderId: o1.id } });
    await verifyPayments({ tenantId, actorId, actorRole: "OWNER", paymentIds: [p1.id] });
    await step("2. advance verified", o1.id, "80000", "CONFIRMED");

    // ───────── 3 — Add a part payment ─────────
    await recordPayment({
      tenantId, actorId, actorRole: "OWNER", orderId: o1.id,
      type: "PART", method: "CASH", amount: "30000", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    await step("3. +part ₹30,000 pending", o1.id, "50000", "CONFIRMED");

    // ───────── 4 — Reject the part payment ─────────
    const p3 = await prisma.payment.findFirstOrThrow({
      where: { orderId: o1.id, type: "PART" },
    });
    await rejectPayment({
      tenantId, actorId, actorRole: "OWNER",
      paymentId: p3.id, reason: "UTR not found on bank statement",
    });
    await step("4. part rejected ⇒ back to ₹80,000", o1.id, "80000", "CONFIRMED");

    // ───────── 5 — Pending final — DELIVERED does NOT close ─────────
    await prisma.order.update({ where: { id: o1.id }, data: { status: "DELIVERED" } });
    await recordPayment({
      tenantId, actorId, actorRole: "OWNER", orderId: o1.id,
      type: "FINAL", method: "UPI", amount: "80000", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    await step("5. DELIVERED + pending final (verifiedNet still 20k)", o1.id, "0", "DELIVERED");

    // ───────── 6 — Verify the final ⇒ CLOSED ─────────
    const p5 = await prisma.payment.findFirstOrThrow({
      where: { orderId: o1.id, type: "FINAL" },
    });
    await verifyPayments({ tenantId, actorId, actorRole: "OWNER", paymentIds: [p5.id] });
    await step("6. final verified ⇒ CLOSED", o1.id, "0", "CLOSED");

    // ───────── 7 — Reject the previously-verified final ⇒ reopens to DELIVERED ─────────
    await rejectPayment({
      tenantId, actorId, actorRole: "OWNER",
      paymentId: p5.id, reason: "Bounced",
    });
    await step("7. final rejected ⇒ reopen DELIVERED", o1.id, "80000", "DELIVERED");

    // ───────── 8 — Overpayment is blocked ─────────
    const o8 = await freshOrder();
    await expect(
      recordPayment({
        tenantId, actorId, actorRole: "OWNER", orderId: o8.id,
        type: "ADVANCE", method: "UPI", amount: "100001.5", paidOn: new Date(),
        receivedIntoAccountId: bankAccountId,
      }),
    ).rejects.toThrow(/exceeds balance/i);
    await step("8. overpayment refused — no state change", o8.id, "100000", "CONFIRMED");

    // ───────── 9 — Cancel order with pending advance ⇒ refund-due visible as negative ─────────
    const o9 = await freshOrder();
    await recordPayment({
      tenantId, actorId, actorRole: "OWNER", orderId: o9.id,
      type: "ADVANCE", method: "UPI", amount: "25000", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    const p9 = await prisma.payment.findFirstOrThrow({ where: { orderId: o9.id } });
    await verifyPayments({ tenantId, actorId, actorRole: "OWNER", paymentIds: [p9.id] });
    await cancelOrder({
      tenantId, actorId, actorRole: "OWNER",
      id: o9.id, reason: "CUSTOMER_CHANGED_MIND",
    });
    await step("9. cancelled with ₹25k verified ⇒ refund due", o9.id, "-25000", "CANCELLED");

    // ───────── 10 — Record refund settles the refund-due ─────────
    await recordRefund({
      tenantId, actorId, actorRole: "OWNER", orderId: o9.id,
      amount: "25000", method: "BANK_TRANSFER", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    const refund10 = await prisma.payment.findFirstOrThrow({
      where: { orderId: o9.id, type: "REFUND" },
    });
    await verifyPayments({ tenantId, actorId, actorRole: "OWNER", paymentIds: [refund10.id] });
    await step("10. refund verified ⇒ balance 0", o9.id, "0", "CANCELLED");

    // ───────── 11 — Cash with staff ⇒ mark deposited ─────────
    const o11 = await freshOrder();
    await recordPayment({
      tenantId, actorId: salespersonId, actorRole: "SALES", orderId: o11.id,
      type: "ADVANCE", method: "CASH", amount: "15000", paidOn: new Date(),
      receivedByUserId: salespersonId,
    });
    const p11 = await prisma.payment.findFirstOrThrow({ where: { orderId: o11.id } });
    await markDeposited({
      tenantId, actorId, actorRole: "OWNER",
      paymentId: p11.id,
      depositedToAccountId: bankAccountId,
      depositedOn: new Date(),
    });
    const after11 = await prisma.payment.findUnique({ where: { id: p11.id } });
    expect(after11?.depositedToAccountId).toBe(bankAccountId);
    expect(after11?.depositedOn).toBeInstanceOf(Date);
    await step("11. cash-with-staff + deposited (no balance change)", o11.id, "85000", "CONFIRMED");

    // ───────── 12 — Bulk verify two pending payments on a DELIVERED order ─────────
    const o12 = await freshOrder({ total: "50000", status: "DELIVERED" });
    await recordPayment({
      tenantId, actorId, actorRole: "OWNER", orderId: o12.id,
      type: "ADVANCE", method: "UPI", amount: "25000", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    await recordPayment({
      tenantId, actorId, actorRole: "OWNER", orderId: o12.id,
      type: "FINAL", method: "CASH", amount: "25000", paidOn: new Date(),
      receivedIntoAccountId: bankAccountId,
    });
    const pending = await prisma.payment.findMany({
      where: { orderId: o12.id, status: "PENDING_VERIFICATION" },
      select: { id: true },
    });
    await verifyPayments({
      tenantId, actorId, actorRole: "OWNER",
      paymentIds: pending.map((p) => p.id),
    });
    await step("12. bulk-verify 2 payments ⇒ CLOSED", o12.id, "0", "CLOSED");

    // Final summary — captured in gate evidence.
    for (const r of results) {
      console.log(
        `[P3-gate] ${r.step.padEnd(55)} ` +
          `expected=${r.expectedBalance.padStart(10)}/${r.expectedStatus.padEnd(10)} ` +
          `actual=${r.actualBalance.padStart(10)}/${r.actualStatus}`,
      );
    }
  }, 180_000);
});
