"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import type { WaSettingsView } from "@/server/services/whatsappSettingsService";
import { saveWhatsAppSettingsAction, testSendAction } from "./actions";

const TEMPLATES = ["order_confirmation", "payment_received", "dispatch_update", "payment_reminder"] as const;
const card = "space-y-4 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4";

export function WhatsAppSettingsForm({ view, webhookUrl }: { view: WaSettingsView; webhookUrl: string }) {
  const t = useTranslations("settings.whatsapp");
  const router = useRouter();
  const [f, setF] = React.useState({
    phoneNumberId: view.phoneNumberId,
    businessAccountId: view.businessAccountId,
    accessToken: "",
    appSecret: "",
    payTo: view.payTo,
    templateNames: view.templateNames,
    language: view.language,
    autoRemindersEnabled: view.autoRemindersEnabled,
    autoReminderEveryDays: view.autoReminderEveryDays,
    autoReminderMaxCount: view.autoReminderMaxCount,
  });
  const [clearToken, setClearToken] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [testPhone, setTestPhone] = React.useState("");
  const [testResult, setTestResult] = React.useState<{ mode: "api"; messageId: string } | { mode: "deeplink"; href: string } | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save(regenerateVerifyToken = false) {
    setPending(true);
    try {
      const r = await saveWhatsAppSettingsAction({
        ...f,
        accessToken: clearToken ? null : f.accessToken,
        appSecret: f.appSecret,
        regenerateVerifyToken,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("saved"));
      setF((p) => ({ ...p, accessToken: "", appSecret: "" }));
      setClearToken(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function test() {
    setTestResult(null);
    const r = await testSendAction({ phone: testPhone });
    if (!r.ok) {
      toast.error(r.error.message);
      return;
    }
    setTestResult(r.data);
  }

  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast.success(t("copied")));

  return (
    <div className="space-y-5">
      <div className={card}>
        <h3 className="label-caps">{t("credentials")}</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="wa-pn">{t("phoneNumberId")}</Label>
            <Input id="wa-pn" value={f.phoneNumberId} onChange={(e) => set("phoneNumberId", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-ba">{t("businessAccountId")}</Label>
            <Input id="wa-ba" value={f.businessAccountId} onChange={(e) => set("businessAccountId", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-token">{t("accessToken")}</Label>
            <Input id="wa-token" type="password" autoComplete="off" value={f.accessToken} placeholder={view.tokenSet ? t("savedEncrypted") : ""} onChange={(e) => set("accessToken", e.target.value)} disabled={clearToken} />
            {view.tokenSet && (
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
                <input type="checkbox" checked={clearToken} onChange={(e) => setClearToken(e.target.checked)} /> {t("clearToken")}
              </label>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-secret">{t("appSecret")}</Label>
            <Input id="wa-secret" type="password" autoComplete="off" value={f.appSecret} placeholder={view.appSecretSet ? t("savedEncrypted") : ""} onChange={(e) => set("appSecret", e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="wa-payto">{t("payTo")}</Label>
            <Input id="wa-payto" value={f.payTo} placeholder="UPI: kumaar@hdfcbank" onChange={(e) => set("payTo", e.target.value)} />
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="label-caps">{t("templates")}</h3>
        <p className="text-xs text-[color:var(--color-ink-3)]">{t("templatesHelp")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {TEMPLATES.map((k) => (
            <div key={k} className="space-y-1">
              <Label htmlFor={`wa-t-${k}`}>{t(`templateLabel.${k}`)}</Label>
              <Input id={`wa-t-${k}`} value={f.templateNames[k]} onChange={(e) => set("templateNames", { ...f.templateNames, [k]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="wa-lang">{t("language")}</Label>
            <Input id="wa-lang" value={f.language} onChange={(e) => set("language", e.target.value)} />
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="label-caps">{t("webhook")}</h3>
        <div className="space-y-1">
          <Label>{t("webhookUrl")}</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(webhookUrl)} aria-label={t("copy")}><Copy className="h-4 w-4" /></Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label>{t("verifyToken")}</Label>
          <div className="flex gap-2">
            <Input readOnly value={view.verifyToken || t("notSetYet")} className="font-mono text-xs" />
            <Button variant="outline" size="icon" onClick={() => copy(view.verifyToken)} disabled={!view.verifyToken} aria-label={t("copy")}><Copy className="h-4 w-4" /></Button>
            <Button variant="outline" onClick={() => save(true)} disabled={pending}>{t("regenerate")}</Button>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="label-caps">{t("autoReminders")}</h3>
        <label className="flex items-center gap-3 text-sm">
          <input type="checkbox" className="h-4 w-4" checked={f.autoRemindersEnabled} onChange={(e) => set("autoRemindersEnabled", e.target.checked)} />
          {t("autoEnabled")}
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="wa-every">{t("everyDays")}</Label>
            <Input id="wa-every" type="number" min={2} max={30} value={f.autoReminderEveryDays} onChange={(e) => set("autoReminderEveryDays", Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="wa-max">{t("maxCount")}</Label>
            <Input id="wa-max" type="number" min={1} max={10} value={f.autoReminderMaxCount} onChange={(e) => set("autoReminderMaxCount", Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-[color:var(--color-ink-3)]">{t("autoRules")}</p>
      </div>

      <Button data-gold="true" className="h-12 w-full text-base sm:w-auto sm:px-10" disabled={pending} onClick={() => save(false)}>
        {pending ? t("saving") : t("save")}
      </Button>

      <div className={card}>
        <h3 className="label-caps">{t("testSend")}</h3>
        <div className="flex flex-wrap gap-2">
          <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="98xxxxxx12" inputMode="tel" className="max-w-xs" aria-label={t("testPhone")} />
          <Button variant="outline" onClick={test} disabled={testPhone.trim().length < 6}><MessageCircle className="h-4 w-4" />{t("sendTest")}</Button>
        </div>
        {testResult?.mode === "api" && <p className="text-sm text-[color:var(--color-ok)]">{t("testSent", { id: testResult.messageId })}</p>}
        {testResult?.mode === "deeplink" && (
          <p className="text-sm">
            {t("testDeeplink")}{" "}
            <a href={testResult.href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">{t("openInWhatsapp")}</a>
          </p>
        )}
      </div>
    </div>
  );
}
