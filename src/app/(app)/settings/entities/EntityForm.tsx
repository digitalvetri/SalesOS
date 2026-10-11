"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { updateEntityAction } from "./actions";

export type EntityFormProps = {
  // Marks this form's Save button as the single [data-gold] element on the page.
  // Spec §10.4 requires exactly one per screen; the Entities page passes gold=true to the first entity.
  gold?: boolean;
  entity: {
    id: string;
    code: string;
    name: string;
    gstin: string | null;
    address: string | null;
    phone: string | null;
    active: boolean;
    accountCount: number;
  };
};

export function EntityForm({ entity, gold }: EntityFormProps) {
  const t = useTranslations("settings.entities");
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState(entity.name);
  const [gstin, setGstin] = React.useState(entity.gstin ?? "");
  const [address, setAddress] = React.useState(entity.address ?? "");
  const [phone, setPhone] = React.useState(entity.phone ?? "");

  const dirty =
    name !== entity.name ||
    gstin !== (entity.gstin ?? "") ||
    address !== (entity.address ?? "") ||
    phone !== (entity.phone ?? "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || pending) return;
    setPending(true);
    try {
      const r = await updateEntityAction({
        id: entity.id,
        name,
        gstin: gstin || null,
        address: address || null,
        phone: phone || null,
      });
      if (!r.ok) toast.error(r.error.message);
      else toast.success(t("saved"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5"
    >
      <header className="flex items-center justify-between">
        <div>
          <div className="label-caps">{t("colCode")}</div>
          <div className="text-xl font-semibold">{entity.code}</div>
        </div>
        <span className="text-xs text-[color:var(--color-ink-3)]">
          {entity.accountCount} {t("colAccounts").toLowerCase()}
        </span>
      </header>

      <div className="space-y-2">
        <Label htmlFor={`${entity.id}-name`}>{t("colName")}</Label>
        <Input
          id={`${entity.id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${entity.id}-gstin`}>{t("colGstin")}</Label>
        <Input
          id={`${entity.id}-gstin`}
          value={gstin}
          onChange={(e) => setGstin(e.target.value.toUpperCase())}
          maxLength={15}
          placeholder="33ABCDE1234F1Z5"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${entity.id}-phone`}>Phone</Label>
          <Input
            id={`${entity.id}-phone`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${entity.id}-address`}>Address</Label>
          <Input
            id={`${entity.id}-address`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={400}
          />
        </div>
      </div>

      <Button type="submit" gold={gold} disabled={!dirty || pending} className="w-full">
        {pending ? "…" : t("save")}
      </Button>
    </form>
  );
}
