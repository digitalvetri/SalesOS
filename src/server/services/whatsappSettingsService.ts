// Settings → WhatsApp (§11.13): credentials (write-only, encrypted at rest),
// template names, webhook verify token, pay-to line, auto-reminder settings.
import { randomBytes } from "node:crypto";
import { prisma, type Prisma } from "@/server/repo/client";
import { writeAudit } from "@/server/repo/audit";
import { encryptSecret } from "@/server/security/secrets";
import { TEMPLATES, type TemplateName } from "@/server/domain/whatsapp/whatsapp";
import { AppError } from "@/lib/errors";

export type WaSettingsView = {
  phoneNumberId: string;
  businessAccountId: string;
  tokenSet: boolean;
  appSecretSet: boolean;
  verifyToken: string;
  payTo: string;
  templateNames: Record<TemplateName, string>;
  language: string;
  autoRemindersEnabled: boolean;
  autoReminderEveryDays: number;
  autoReminderMaxCount: number;
  configured: boolean;
};

export async function getWaSettingsView(tenantId: string): Promise<WaSettingsView> {
  const s = await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
  const names = (s.waTemplatesJson ?? {}) as Partial<Record<TemplateName, string>> & { language?: string };
  return {
    phoneNumberId: s.waPhoneNumberId ?? "",
    businessAccountId: s.waBusinessAccountId ?? "",
    tokenSet: Boolean(s.waAccessTokenEnc),
    appSecretSet: Boolean(s.waAppSecretEnc),
    verifyToken: s.waVerifyToken ?? "",
    payTo: s.waPayToText ?? "",
    templateNames: Object.fromEntries(TEMPLATES.map((t) => [t, names[t] ?? t])) as Record<TemplateName, string>,
    language: names.language ?? "en",
    autoRemindersEnabled: s.autoRemindersEnabled,
    autoReminderEveryDays: s.autoReminderEveryDays,
    autoReminderMaxCount: s.autoReminderMaxCount,
    configured: Boolean(s.waPhoneNumberId && s.waAccessTokenEnc),
  };
}

export type WaSettingsInput = {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken?: string | null; // undefined/empty = keep; null = clear
  appSecret?: string | null;
  regenerateVerifyToken?: boolean;
  payTo: string;
  templateNames: Record<TemplateName, string>;
  language: string;
  autoRemindersEnabled: boolean;
  autoReminderEveryDays: number;
  autoReminderMaxCount: number;
};

export async function updateWaSettings(tenantId: string, actorId: string, input: WaSettingsInput) {
  if (input.autoReminderEveryDays < 2 || input.autoReminderEveryDays > 30) {
    throw new AppError("VALIDATION", "Remind every 2–30 days (the 48-hour rule makes 1 day impossible).");
  }
  if (input.autoReminderMaxCount < 1 || input.autoReminderMaxCount > 10) {
    throw new AppError("VALIDATION", "Maximum reminders must be 1–10.");
  }
  const before = await getWaSettingsView(tenantId);
  const data: Prisma.TenantSettingsUpdateInput = {
    waPhoneNumberId: input.phoneNumberId.trim() || null,
    waBusinessAccountId: input.businessAccountId.trim() || null,
    waPayToText: input.payTo.trim() || null,
    waTemplatesJson: { ...Object.fromEntries(TEMPLATES.map((t) => [t, input.templateNames[t]?.trim() || t])), language: input.language.trim() || "en" },
    autoRemindersEnabled: input.autoRemindersEnabled,
    autoReminderEveryDays: input.autoReminderEveryDays,
    autoReminderMaxCount: input.autoReminderMaxCount,
  };
  if (input.accessToken === null) data.waAccessTokenEnc = null;
  else if (input.accessToken?.trim()) data.waAccessTokenEnc = encryptSecret(input.accessToken.trim());
  if (input.appSecret === null) data.waAppSecretEnc = null;
  else if (input.appSecret?.trim()) data.waAppSecretEnc = encryptSecret(input.appSecret.trim());
  if (input.regenerateVerifyToken || !before.verifyToken) data.waVerifyToken = randomBytes(18).toString("base64url");

  await prisma.$transaction(async (tx) => {
    await tx.tenantSettings.update({ where: { tenantId }, data });
    // Never log secret values — only whether they changed.
    await writeAudit(tx, {
      tenantId,
      actorId,
      action: "SETTINGS_WHATSAPP",
      entity: "TenantSettings",
      entityId: tenantId,
      before: { ...before, verifyToken: undefined },
      after: {
        phoneNumberId: data.waPhoneNumberId,
        tokenChanged: input.accessToken !== undefined && input.accessToken !== "",
        appSecretChanged: input.appSecret !== undefined && input.appSecret !== "",
        verifyTokenRegenerated: Boolean(data.waVerifyToken),
        autoRemindersEnabled: input.autoRemindersEnabled,
      },
    });
  });
  return getWaSettingsView(tenantId);
}
