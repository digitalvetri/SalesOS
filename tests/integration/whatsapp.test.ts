// §17-P6: send service (API + deep-link fallback), 48 h rate limit, webhook
// signature + idempotency, auto-reminder job windows. Meta is a fake fetch.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { encryptSecret, signMetaBody } from "@/server/security/secrets";
import {
  sendTemplate,
  sendPaymentReminder,
  processWebhook,
  verifyWebhookToken,
  runAutoReminders,
  AUTO_REMINDER_NOTE,
  GRAPH_URL,
} from "@/server/services/whatsappService";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_READY =
  Boolean(process.env.DATABASE_URL) &&
  (/:55422\b/.test(process.env.DATABASE_URL!) || process.env.SB_INTEGRATION_TESTS === "1");

type Call = { url: string; init: RequestInit };
let wamid = 0; // unique across fakes, like real wamids
function fakeMeta(behaviour: "ok" | "error" | "throw" = "ok") {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (behaviour === "throw") throw new Error("network down");
    if (behaviour === "error") return new Response(JSON.stringify({ error: { message: "Template not approved" } }), { status: 400 });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${Date.now()}.${++wamid}` }] }), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

// Mon 20 Oct 2026, 11:30 IST — inside the window.
const MON_1130 = new Date("2026-10-19T06:00:00Z");

describe.skipIf(!DB_READY)("P6 — WhatsApp", () => {
  const prisma = new PrismaClient();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const phoneNumberId = `pn-${stamp}`;
  const appSecret = `secret-${stamp}`;
  let tenantId = "";
  let salesId = "";
  const customerPhone = "+919999992100";
  let orderId = "";

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({
      data: {
        slug: `test-wa-${stamp}`, name: "wa",
        settings: { create: { autoRemindersEnabled: true, autoReminderEveryDays: 5, autoReminderMaxCount: 2, overdueGraceDays: 7 } },
      },
    })).id;
    const entity = (await prisma.billingEntity.create({ data: { tenantId, code: `W${stamp.slice(-5)}`, name: "WA Co" } })).id;
    salesId = (await prisma.user.create({ data: { tenantId, authUserId: `wa-${stamp}`, name: "Sales", phoneE164: "+919999992001", role: "SALES" } })).id;
    const cust = await prisma.customer.create({ data: { tenantId, name: "Gokul", phoneE164: customerPhone } });
    orderId = (await prisma.order.create({
      data: {
        tenantId, number: "WA/1", entityId: entity, customerId: cust.id, salespersonId: salesId, orderDate: new Date("2026-09-01"),
        status: "DELIVERED", subtotal: "24000", total: "24000", balanceDue: "14000", promisedPaymentDate: new Date("2026-10-01"), createdById: salesId,
      },
    })).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.whatsAppMessage.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.followUp.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } });
    await prisma.billingEntity.deleteMany({ where: { tenantId } });
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  const configure = (on: boolean) =>
    prisma.tenantSettings.update({
      where: { tenantId },
      data: on
        ? { waPhoneNumberId: phoneNumberId, waAccessTokenEnc: encryptSecret("EAAG-test-token"), waAppSecretEnc: encryptSecret(appSecret), waVerifyToken: `verify-${stamp}`, waTemplatesJson: { payment_reminder: "pay_reminder_v2", language: "en" } }
        : { waPhoneNumberId: null, waAccessTokenEnc: null },
    });
  const msg = { template: "payment_reminder" as const, name: "Gokul", orderNumber: "WA/1", balance: "14000", payTo: null };

  beforeEach(async () => {
    await prisma.followUp.deleteMany({ where: { orderId } });
  });

  it("not configured → DEEPLINK row + wa.me link (§13 fallback)", async () => {
    await configure(false);
    const r = await sendTemplate({ tenantId, actorId: salesId, orderId, toE164: customerPhone, message: msg });
    expect(r).toEqual({ mode: "deeplink", href: expect.stringMatching(/^https:\/\/wa\.me\/919999992100\?text=Gentle%20reminder%3A%20%E2%82%B914%2C000/) });
    const row = await prisma.whatsAppMessage.findFirstOrThrow({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    expect(row).toMatchObject({ status: "DEEPLINK", template: "payment_reminder", error: null });
  });

  it("configured → Cloud API call with decrypted token, template name + params; SENT row", async () => {
    await configure(true);
    const meta = fakeMeta("ok");
    const r = await sendTemplate({ tenantId, actorId: salesId, orderId, toE164: customerPhone, message: msg, fetchImpl: meta.impl });
    expect(r.mode).toBe("api");
    expect(meta.calls[0]!.url).toBe(`${GRAPH_URL}/${phoneNumberId}/messages`);
    expect((meta.calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer EAAG-test-token");
    const body = JSON.parse(meta.calls[0]!.init.body as string);
    expect(body).toMatchObject({
      to: "919999992100",
      template: { name: "pay_reminder_v2", language: { code: "en" }, components: [{ type: "body", parameters: [{ text: "Gokul" }, { text: "WA/1" }, { text: "₹14,000" }, { text: "—" }] }] },
    });
    const row = await prisma.whatsAppMessage.findFirstOrThrow({ where: { tenantId, waMessageId: (r as { messageId: string }).messageId } });
    expect(row.status).toBe("SENT");
  });

  it("API error or network failure → falls back to DEEPLINK with the error recorded", async () => {
    await configure(true);
    for (const b of ["error", "throw"] as const) {
      const r = await sendTemplate({ tenantId, actorId: salesId, orderId, toE164: customerPhone, message: msg, fetchImpl: fakeMeta(b).impl });
      expect(r.mode).toBe("deeplink");
    }
    const rows = await prisma.whatsAppMessage.findMany({ where: { tenantId, status: "DEEPLINK", error: { not: null } }, orderBy: { createdAt: "asc" } });
    expect(rows.map((x) => x.error)).toEqual(["HTTP 400: Template not approved", "network down"]);
  });

  it("rate limit: one payment_reminder per order per 48 h (manual)", async () => {
    await configure(true);
    const meta = fakeMeta("ok");
    const first = await sendPaymentReminder({ tenantId, actorId: salesId, actorRole: "SALES", orderIds: [orderId], fetchImpl: meta.impl });
    expect(first.results[0]!.mode).toBe("api");
    const second = sendPaymentReminder({ tenantId, actorId: salesId, actorRole: "SALES", orderIds: [orderId], fetchImpl: meta.impl });
    await expect(second).rejects.toMatchObject({ code: "CONFLICT" });
    expect(meta.calls).toHaveLength(1); // nothing sent the second time
    console.log(`[P6-gate] rate limit: 1st reminder → ${first.results[0]!.mode}; 2nd within 48 h → CONFLICT "${await second.catch((e) => e.userMessage)}"`);
  });

  it("webhook GET verify token", async () => {
    await configure(true);
    expect(await verifyWebhookToken("subscribe", `verify-${stamp}`)).toBe(true);
    expect(await verifyWebhookToken("subscribe", "wrong")).toBe(false);
    expect(await verifyWebhookToken("unsubscribe", `verify-${stamp}`)).toBe(false);
  });

  it("webhook POST: signature required; statuses move forward only; idempotent", async () => {
    await configure(true);
    const sent = await sendTemplate({ tenantId, actorId: salesId, orderId, toE164: customerPhone, message: msg, fetchImpl: fakeMeta("ok").impl });
    const id = (sent as { messageId: string }).messageId;
    const payload = (status: string) =>
      JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, statuses: [{ id, status }] } }] }] });

    const bad = payload("delivered");
    expect(await processWebhook(bad, signMetaBody(bad, "wrong-secret"))).toEqual({ ok: false, updated: 0 });
    expect(await processWebhook(bad, null)).toEqual({ ok: false, updated: 0 });
    expect((await prisma.whatsAppMessage.findFirstOrThrow({ where: { waMessageId: id } })).status).toBe("SENT");

    const steps: string[] = [];
    for (const s of ["delivered", "read", "delivered", "read"]) {
      const body = payload(s);
      const r = await processWebhook(body, signMetaBody(body, appSecret));
      steps.push(`${s} → updated ${r.updated} → ${(await prisma.whatsAppMessage.findFirstOrThrow({ where: { waMessageId: id } })).status}`);
    }
    expect(steps).toEqual(["delivered → updated 1 → DELIVERED", "read → updated 1 → READ", "delivered → updated 0 → READ", "read → updated 0 → READ"]);
    console.log(steps.map((s) => `[P6-gate] webhook ${s}`).join("\n"));
  });

  it("auto reminders: window, Sunday, cooldown, every-N-days, max count, not configured", async () => {
    await configure(true);
    const meta = fakeMeta("ok");
    const run = (now: Date) => runAutoReminders({ now, fetchImpl: meta.impl, tenantId });
    const log: string[] = [];
    const rec = async (label: string, now: Date) => {
      const r = await run(now);
      log.push(`${label}: sent ${r.sent}, skipped ${JSON.stringify(r.skipped)}`);
      return r;
    };

    expect((await rec("Mon 09:00 IST", new Date("2026-10-19T03:30:00Z"))).skipped).toEqual({ outside_window: 1 });
    expect((await rec("Sun 11:30 IST", new Date("2026-10-18T06:00:00Z"))).skipped).toEqual({ outside_window: 1 });
    expect((await rec("Mon 11:30 IST", MON_1130)).sent).toBe(1);
    expect((await rec("Tue 11:30 (24 h later)", new Date(MON_1130.getTime() + 24 * 3_600_000))).skipped).toEqual({ cooldown: 1 });
    expect((await rec("Thu 11:30 (3 d later)", new Date(MON_1130.getTime() + 72 * 3_600_000))).skipped).toEqual({ not_due_yet: 1 });
    expect((await rec("Sat 11:30 (5 d later)", new Date(MON_1130.getTime() + 120 * 3_600_000))).sent).toBe(1);
    expect((await rec("next Thu (max 2 reached)", new Date(MON_1130.getTime() + 240 * 3_600_000))).skipped).toEqual({ max_reached: 1 });
    expect(await prisma.followUp.count({ where: { orderId, note: AUTO_REMINDER_NOTE } })).toBe(2);
    expect(meta.calls).toHaveLength(2);

    await configure(false);
    expect((await rec("not configured", MON_1130)).skipped).toEqual({ not_configured: 1 });
    console.log(log.map((s) => `[P6-gate] auto ${s}`).join("\n"));
  });
});
