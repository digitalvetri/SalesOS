// §11.13 Settings → WhatsApp: credentials, template names, test-send, webhook
// URL + verify token, auto-reminder settings. Secrets are write-only.
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { getWaSettingsView } from "@/server/services/whatsappSettingsService";
import { WhatsAppSettingsForm } from "./WhatsAppSettingsForm";

export default async function WhatsAppSettingsPage() {
  const session = await requireSession();
  const t = await getTranslations("settings.whatsapp");
  const view = await getWaSettingsView(session.tenantId);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <section className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-[color:var(--color-ink-2)]">{view.configured ? t("statusApi") : t("statusDeeplink")}</p>
      </div>
      <WhatsAppSettingsForm view={view} webhookUrl={`${base}/api/whatsapp/webhook`} />
    </section>
  );
}
