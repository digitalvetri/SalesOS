// WhatsApp (§13): Meta Cloud API send with a wa.me deep-link fallback, the
// status webhook, and the auto-reminder job. Every attempt is a WhatsAppMessage
// row (QUEUED | SENT | DELIVERED | READ | FAILED | DEEPLINK).
import Decimal from "decimal.js";
import { prisma, type Role } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { decryptSecret, verifyMetaSignature } from "@/server/security/secrets";
import {
  templateParams,
  templateText,
  isWithinSendWindow,
  autoReminderDecision,
  nextStatus,
  type TemplateInput,
  type TemplateName,
} from "@/server/domain/whatsapp/whatsapp";
import { overdueInfo, waLink } from "@/server/domain/payment/collect";
import { realPhone } from "@/lib/orderDisplay";
import { istDateString } from "@/server/domain/payment/record";
import { logReminder } from "@/server/services/followUpService";

export const GRAPH_URL = "https://graph.facebook.com/v21.0";
const SEND_TIMEOUT_MS = 5_000;
export const AUTO_REMINDER_NOTE = "Auto reminder (WhatsApp)";
type Fetch = typeof fetch;

export type WaConfig = {
  configured: boolean;
  phoneNumberId: string | null;
  token: string | null;
  templateNames: Record<TemplateName, string>;
  language: string;
  payTo: string | null;
};

export async function getWaConfig(tenantId: string): Promise<WaConfig> {
  const s = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { waPhoneNumberId: true, waAccessTokenEnc: true, waTemplatesJson: true, waPayToText: true },
  });
  let token: string | null = null;
  if (s?.waAccessTokenEnc) {
    try {
      token = decryptSecret(s.waAccessTokenEnc);
    } catch (e) {
      console.error("[whatsapp] could not decrypt access token — falling back to deep links", e);
    }
  }
  const names = (s?.waTemplatesJson ?? {}) as Partial<Record<TemplateName, string>> & { language?: string };
  return {
    configured: Boolean(s?.waPhoneNumberId && token),
    phoneNumberId: s?.waPhoneNumberId ?? null,
    token,
    templateNames: {
      order_confirmation: names.order_confirmation || "order_confirmation",
      payment_received: names.payment_received || "payment_received",
      dispatch_update: names.dispatch_update || "dispatch_update",
      payment_reminder: names.payment_reminder || "payment_reminder",
    },
    language: names.language || "en",
    payTo: s?.waPayToText ?? null,
  };
}

export type SendResult = { mode: "api"; messageId: string } | { mode: "deeplink"; href: string };

/**
 * Sends a template via the Cloud API when configured; otherwise (or when the
 * API call fails) records a DEEPLINK row and returns the wa.me link (§13 fallback).
 */
export async function sendTemplate(input: {
  tenantId: string;
  actorId: string | null;
  orderId: string | null;
  toE164: string;
  message: TemplateInput;
  config?: WaConfig;
  fetchImpl?: Fetch;
}): Promise<SendResult> {
  const cfg = input.config ?? (await getWaConfig(input.tenantId));
  const params = templateParams(input.message);
  const base = {
    tenantId: input.tenantId,
    orderId: input.orderId,
    toE164: input.toE164,
    template: input.message.template,
    paramsJson: params,
    sentById: input.actorId,
  };
  const fallback = async (error: string | null): Promise<SendResult> => {
    await prisma.whatsAppMessage.create({ data: { ...base, status: "DEEPLINK", error } });
    return { mode: "deeplink", href: waLink(input.toE164, templateText(input.message)) };
  };
  if (!cfg.configured) return fallback(null);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await (input.fetchImpl ?? fetch)(`${GRAPH_URL}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.toE164.replace(/^\+/, ""),
        type: "template",
        template: {
          name: cfg.templateNames[input.message.template],
          language: { code: cfg.language },
          components: [{ type: "body", parameters: params.map((text) => ({ type: "text", text })) }],
        },
      }),
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    const id = json?.messages?.[0]?.id;
    if (!res.ok || !id) return fallback(`HTTP ${res.status}: ${json?.error?.message ?? "no message id"}`.slice(0, 500));
    await prisma.whatsAppMessage.create({ data: { ...base, status: "SENT", waMessageId: id } });
    return { mode: "api", messageId: id };
  } catch (e) {
    return fallback(e instanceof Error ? e.message.slice(0, 500) : "send failed");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "Send reminder" (§5.4, §13). Enforces the 48 h rule + logs FollowUps via
 * followUpService, then sends one `payment_reminder` per customer.
 */
export async function sendPaymentReminder(input: {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  orderIds: string[];
  fetchImpl?: Fetch;
}): Promise<{ results: SendResult[] }> {
  const allOrders = await prisma.order.findMany({
    where: { tenantId: input.tenantId, id: { in: input.orderIds } },
    select: { id: true, number: true, balanceDue: true, customer: { select: { id: true, name: true, businessName: true, phoneE164: true } } },
  });
  // Customers without a contact number (imported rows with an empty CONTACT
  // cell) are skipped — never send to a guessed or placeholder number.
  const orders = allOrders.flatMap((o) => {
    const phone = realPhone(o.customer.phoneE164);
    return phone ? [{ ...o, customer: { ...o.customer, phoneE164: phone } }] : [];
  });
  if (allOrders.length > 0 && orders.length === 0) {
    throw new AppError("VALIDATION", "No phone number on file for this customer, so no WhatsApp reminder can be sent.");
  }
  await logReminder({ ...input, orderIds: orders.length > 0 ? orders.map((o) => o.id) : input.orderIds }); // throws CONFLICT inside the 48 h window
  const cfg = await getWaConfig(input.tenantId);
  const byCustomer = new Map<string, typeof orders>();
  for (const o of orders) byCustomer.set(o.customer.id, [...(byCustomer.get(o.customer.id) ?? []), o]);
  const results: SendResult[] = [];
  for (const group of byCustomer.values()) {
    const c = group[0]!.customer;
    results.push(
      await sendTemplate({
        tenantId: input.tenantId,
        actorId: input.actorId,
        orderId: group.length === 1 ? group[0]!.id : null,
        toE164: c.phoneE164,
        config: cfg,
        fetchImpl: input.fetchImpl,
        message: {
          template: "payment_reminder",
          name: c.businessName ?? c.name,
          orderNumber: group.map((o) => o.number).join(", "),
          balance: group.reduce((s, o) => s.plus(o.balanceDue.toString()), new Decimal(0)).toString(),
          payTo: cfg.payTo,
        },
      }),
    );
  }
  return { results };
}

/** `payment_received` after verification — API only (nobody to open a deep link). Best effort. */
export async function notifyPaymentsVerified(input: { tenantId: string; actorId: string; paymentIds: string[]; fetchImpl?: Fetch }) {
  const cfg = await getWaConfig(input.tenantId);
  if (!cfg.configured) return { sent: 0 };
  const payments = await prisma.payment.findMany({
    where: { tenantId: input.tenantId, id: { in: input.paymentIds }, status: "VERIFIED", type: { not: "REFUND" } },
    select: { amount: true, receiptNo: true, orderId: true, order: { select: { balanceDue: true, customer: { select: { name: true, businessName: true, phoneE164: true } } } } },
  });
  let sent = 0;
  for (const p of payments) {
    const to = realPhone(p.order.customer.phoneE164);
    if (!to) continue; // no number on file — nothing to send
    const r = await sendTemplate({
      tenantId: input.tenantId, actorId: input.actorId, orderId: p.orderId, toE164: to, config: cfg, fetchImpl: input.fetchImpl,
      message: {
        template: "payment_received", name: p.order.customer.businessName ?? p.order.customer.name,
        amount: p.amount.toString(), receiptNo: p.receiptNo, balance: Decimal.max(0, p.order.balanceDue.toString()).toString(),
      },
    });
    if (r.mode === "api") sent += 1;
  }
  return { sent };
}

// ───────── Webhook ─────────

type WebhookBody = {
  entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; statuses?: { id?: string; status?: string; errors?: { title?: string }[] }[] } }[] }[];
};

/** GET verify: returns the challenge when hub.verify_token matches a tenant's token. */
export async function verifyWebhookToken(mode: string | null, token: string | null): Promise<boolean> {
  if (mode !== "subscribe" || !token) return false;
  const hit = await prisma.tenantSettings.findFirst({ where: { waVerifyToken: token }, select: { tenantId: true } });
  return Boolean(hit);
}

/**
 * POST status callback. The signature is checked against the app secret of the
 * tenant that owns `phone_number_id` BEFORE any field is trusted. Idempotent on
 * waMessageId: statuses only move forward (sent → delivered → read, or failed).
 */
export async function processWebhook(rawBody: string, signature: string | null): Promise<{ ok: boolean; updated: number }> {
  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return { ok: false, updated: 0 };
  }
  const phoneIds = new Set(
    (body.entry ?? []).flatMap((e) => (e.changes ?? []).map((c) => c.value?.metadata?.phone_number_id).filter((x): x is string => Boolean(x))),
  );
  if (phoneIds.size !== 1) return { ok: false, updated: 0 };
  const settings = await prisma.tenantSettings.findFirst({
    where: { waPhoneNumberId: [...phoneIds][0] },
    select: { tenantId: true, waAppSecretEnc: true },
  });
  if (!settings?.waAppSecretEnc) return { ok: false, updated: 0 };
  let secret: string;
  try {
    secret = decryptSecret(settings.waAppSecretEnc);
  } catch {
    return { ok: false, updated: 0 };
  }
  if (!verifyMetaSignature(rawBody, signature, secret)) return { ok: false, updated: 0 };

  let updated = 0;
  for (const st of (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []))) {
    if (!st.id || !st.status) continue;
    const msg = await prisma.whatsAppMessage.findFirst({
      where: { tenantId: settings.tenantId, waMessageId: st.id },
      select: { id: true, status: true },
    });
    if (!msg) continue;
    const next = nextStatus(msg.status, st.status);
    if (!next) continue;
    // Conditional update: a concurrent duplicate callback can't move it backwards.
    const { count } = await prisma.whatsAppMessage.updateMany({
      where: { id: msg.id, status: msg.status },
      data: { status: next, ...(next === "FAILED" ? { error: st.errors?.[0]?.title?.slice(0, 500) ?? "failed" } : {}) },
    });
    updated += count;
  }
  return { ok: true, updated };
}

// ───────── Auto-reminder job (§5.4) ─────────

export type AutoRunSummary = { tenants: number; sent: number; skipped: Record<string, number> };

/**
 * For tenants with auto-reminders ON: overdue orders get `payment_reminder`
 * every N days, max M, never on Sundays, 10:00–19:00 IST only, and never
 * within 48 h of any other reminder. Sends via API only — a cron job has
 * nobody to open a deep link.
 */
export async function runAutoReminders(opts: { now?: Date; fetchImpl?: Fetch; tenantId?: string } = {}): Promise<AutoRunSummary> {
  const now = opts.now ?? new Date();
  const summary: AutoRunSummary = { tenants: 0, sent: 0, skipped: {} };
  const skip = (r: string) => (summary.skipped[r] = (summary.skipped[r] ?? 0) + 1);
  if (!isWithinSendWindow(now)) {
    skip("outside_window");
    return summary;
  }
  const tenants = await prisma.tenantSettings.findMany({
    where: { autoRemindersEnabled: true, ...(opts.tenantId ? { tenantId: opts.tenantId } : {}) },
    select: { tenantId: true, overdueGraceDays: true, autoReminderEveryDays: true, autoReminderMaxCount: true },
  });
  const today = istDateString(now);
  for (const t of tenants) {
    summary.tenants += 1;
    const cfg = await getWaConfig(t.tenantId);
    if (!cfg.configured) {
      skip("not_configured");
      continue;
    }
    const orders = await prisma.order.findMany({
      where: { tenantId: t.tenantId, status: { not: "CANCELLED" }, balanceDue: { gt: 0 } },
      select: {
        id: true, number: true, balanceDue: true, promisedPaymentDate: true,
        customer: { select: { name: true, businessName: true, phoneE164: true } },
        events: { where: { toStatus: "DELIVERED" }, orderBy: { at: "asc" }, take: 1, select: { at: true } },
        followUps: { where: { channel: "WHATSAPP" }, orderBy: { at: "desc" }, select: { at: true, note: true } },
      },
    });
    for (const o of orders) {
      const info = overdueInfo(
        { balanceDue: o.balanceDue.toString(), promisedPaymentDate: o.promisedPaymentDate?.toISOString().slice(0, 10) ?? null, deliveredOn: o.events[0] ? istDateString(o.events[0].at) : null },
        today,
        t.overdueGraceDays,
      );
      const decision = autoReminderDecision(
        { overdue: info.overdue, lastReminderAt: o.followUps[0]?.at ?? null, autoRemindersSent: o.followUps.filter((f) => f.note === AUTO_REMINDER_NOTE).length },
        now,
        t.autoReminderEveryDays,
        t.autoReminderMaxCount,
      );
      if (!decision.send) {
        skip(decision.reason);
        continue;
      }
      const to = realPhone(o.customer.phoneE164);
      if (!to) {
        skip("no_phone");
        continue;
      }
      const r = await sendTemplate({
        tenantId: t.tenantId, actorId: null, orderId: o.id, toE164: to, config: cfg, fetchImpl: opts.fetchImpl,
        message: { template: "payment_reminder", name: o.customer.businessName ?? o.customer.name, orderNumber: o.number, balance: o.balanceDue.toString(), payTo: cfg.payTo },
      });
      if (r.mode !== "api") {
        skip("send_failed");
        continue;
      }
      await prisma.followUp.create({ data: { orderId: o.id, channel: "WHATSAPP", note: AUTO_REMINDER_NOTE, byUserId: "system", at: now } });
      summary.sent += 1;
    }
  }
  return summary;
}

export function assertCronSecret(header: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || header !== `Bearer ${secret}`) throw new AppError("FORBIDDEN", "Bad cron credentials.");
}

// ───────── Dispatch update + order confirmation ─────────

/** `dispatch_update` for one dispatch (§5.3 "offer a one-tap WhatsApp update"). */
export async function sendDispatchUpdate(input: { tenantId: string; actorId: string; dispatchId: string; fetchImpl?: Fetch }): Promise<SendResult> {
  const d = await prisma.dispatch.findFirst({
    where: { id: input.dispatchId, order: { tenantId: input.tenantId } },
    select: {
      transporter: true, lrNumber: true, orderId: true,
      lines: { select: { qty: true, orderLine: { select: { description: true } } } },
      order: { select: { number: true, customer: { select: { name: true, businessName: true, phoneE164: true } } } },
    },
  });
  if (!d) throw new AppError("NOT_FOUND", "Dispatch not found.");
  const to = realPhone(d.order.customer.phoneE164);
  if (!to) throw new AppError("VALIDATION", "No phone number on file for this customer, so no WhatsApp update can be sent.");
  return sendTemplate({
    tenantId: input.tenantId, actorId: input.actorId, orderId: d.orderId, toE164: to, fetchImpl: input.fetchImpl,
    message: {
      template: "dispatch_update",
      name: d.order.customer.businessName ?? d.order.customer.name,
      orderNumber: d.order.number,
      items: d.lines.map((l) => `${l.orderLine.description} ×${l.qty}`).join(", "),
      transporter: d.transporter,
      lrNumber: d.lrNumber,
    },
  });
}

/** `order_confirmation` (§11.3 "Send WhatsApp confirmation", §13). */
export async function sendOrderConfirmation(input: { tenantId: string; actorId: string; orderId: string; fetchImpl?: Fetch }): Promise<SendResult> {
  const o = await prisma.order.findFirst({
    where: { tenantId: input.tenantId, id: input.orderId },
    select: {
      id: true, number: true, total: true, balanceDue: true, promisedDeliveryDate: true,
      entity: { select: { name: true } },
      customer: { select: { name: true, businessName: true, phoneE164: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { description: true, qty: true } },
    },
  });
  if (!o) throw new AppError("NOT_FOUND", "Order not found.");
  const to = realPhone(o.customer.phoneE164);
  if (!to) throw new AppError("VALIDATION", "No phone number on file for this customer, so no WhatsApp confirmation can be sent.");
  const total = new Decimal(o.total.toString());
  return sendTemplate({
    tenantId: input.tenantId, actorId: input.actorId, orderId: o.id, toE164: to, fetchImpl: input.fetchImpl,
    message: {
      template: "order_confirmation",
      name: o.customer.businessName ?? o.customer.name,
      orderNumber: o.number,
      items: o.lines.map((l) => `${l.description} ×${l.qty}`).join(", "),
      total: total.toString(),
      advance: Decimal.max(0, total.minus(o.balanceDue.toString())).toString(),
      balance: Decimal.max(0, o.balanceDue.toString()).toString(),
      deliveryDate: o.promisedDeliveryDate ? o.promisedDeliveryDate.toISOString().slice(0, 10) : null,
      entityName: o.entity.name,
    },
  });
}
