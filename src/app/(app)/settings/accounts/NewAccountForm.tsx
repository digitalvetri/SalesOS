"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { createAccountAction } from "./actions";
import type { AccountKind } from "@/server/repo/client";

type EntityOpt = { id: string; code: string; name: string };

export function NewAccountForm({ entities }: { entities: EntityOpt[] }) {
  const t = useTranslations("settings.accounts");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [entityId, setEntityId] = React.useState(entities[0]?.id ?? "");
  const [label, setLabel] = React.useState("");
  const [kind, setKind] = React.useState<AccountKind>("BANK");
  const [last4, setLast4] = React.useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const r = await createAccountAction({
        entityId,
        label,
        kind,
        last4: last4 || null,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setLabel("");
      setLast4("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
    >
      <h3 className="mb-4 text-sm font-semibold">{t("newAccount")}</h3>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="acc-entity">{t("fieldEntity")}</Label>
          <select
            id="acc-entity"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            required
            className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
          >
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.code}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="acc-label">{t("fieldLabel")}</Label>
          <Input
            id="acc-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="KFM Current A/c (HDFC)"
            maxLength={80}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-kind">{t("fieldKind")}</Label>
          <select
            id="acc-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AccountKind)}
            className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
          >
            <option value="BANK">{t("kindBank")}</option>
            <option value="UPI">{t("kindUpi")}</option>
            <option value="CASH_DRAWER">{t("kindCash")}</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex items-end gap-4">
        <div className="w-32 space-y-2">
          <Label htmlFor="acc-last4">{t("fieldLast4")}</Label>
          <Input
            id="acc-last4"
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="1234"
            maxLength={4}
          />
        </div>
        <Button type="submit" gold disabled={pending || !label} className="h-11">
          {t("newAccount")}
        </Button>
      </div>
    </form>
  );
}
