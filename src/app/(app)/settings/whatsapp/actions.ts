"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import { updateWaSettings } from "@/server/services/whatsappSettingsService";
import { sendTemplate } from "@/server/services/whatsappService";

const Names = z.object({
  order_confirmation: z.string().max(80),
  payment_received: z.string().max(80),
  dispatch_update: z.string().max(80),
  payment_reminder: z.string().max(80),
});

export const saveWhatsAppSettingsAction = makeServerAction({
  input: z.object({
    phoneNumberId: z.string().trim().max(40),
    businessAccountId: z.string().trim().max(40),
    accessToken: z.string().max(1000).nullable().optional(),
    appSecret: z.string().max(200).nullable().optional(),
    regenerateVerifyToken: z.boolean().optional(),
    payTo: z.string().trim().max(120),
    templateNames: Names,
    language: z.string().trim().max(10),
    autoRemindersEnabled: z.boolean(),
    autoReminderEveryDays: z.number().int(),
    autoReminderMaxCount: z.number().int(),
  }),
  action: "settings.manage",
  revalidate: "/settings/whatsapp",
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const view = await updateWaSettings(s.tenantId, s.userId, p);
    return { configured: view.configured };
  },
});

/** Settings "Test send": a sample payment_reminder to a phone you choose. */
export const testSendAction = makeServerAction({
  input: z.object({ phone: z.string().min(6).max(20) }),
  action: "settings.manage",
  async run(p, s) {
    if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    let to: string;
    try {
      to = normalizePhone(p.phone).e164;
    } catch (e) {
      if (e instanceof PhoneParseError) throw new AppError("VALIDATION", e.message);
      throw e;
    }
    return sendTemplate({
      tenantId: s.tenantId,
      actorId: s.userId,
      orderId: null,
      toE164: to,
      message: { template: "payment_reminder", name: "Test", orderNumber: "TEST/0001", balance: "1000", payTo: null },
    });
  },
});
