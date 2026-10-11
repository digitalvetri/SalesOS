"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { PhoneInput, type PhoneMatch } from "@/components/app/PhoneInput";
import { createCustomerAction } from "../actions";
import type { CustomerType } from "@/server/repo/client";

export function NewCustomerForm() {
  const t = useTranslations("customers");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [phoneRaw, setPhoneRaw] = React.useState("");
  const [phoneE164, setPhoneE164] = React.useState<string | null>(null);
  const [match, setMatch] = React.useState<PhoneMatch | null>(null);
  const [name, setName] = React.useState("");
  const [businessName, setBusinessName] = React.useState("");
  const [type, setType] = React.useState<CustomerType>("END_CUSTOMER");
  const [city, setCity] = React.useState("Coimbatore");
  const [gstin, setGstin] = React.useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (match) {
      // Phone-first behavior: typing an existing phone selects that customer.
      router.push(`/customers/${match.id}`);
      return;
    }
    if (!phoneE164) {
      toast.error(t("invalidPhone"));
      return;
    }
    setPending(true);
    try {
      const r = await createCustomerAction({
        phone: phoneE164,
        name: name.trim(),
        businessName: businessName.trim() || null,
        type,
        city: city.trim() || null,
        gstin: gstin.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      router.push(`/customers/${r.data.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="customer-phone">{t("fieldPhone")}</Label>
        <PhoneInput
          id="customer-phone"
          value={phoneRaw}
          onChange={setPhoneRaw}
          onNormalized={setPhoneE164}
          onMatch={setMatch}
          autoFocus
          required
        />
      </div>

      {match ? (
        <div className="space-y-3 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 text-sm">
          <p className="text-[color:var(--color-ink-2)]">{t("existingHint")}</p>
          <Button
            type="submit"
            data-gold
            className="h-11 w-full"
          >
            {t("openExisting")}
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="customer-name">{t("fieldName")}</Label>
            <Input
              id="customer-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-business">{t("fieldBusinessName")}</Label>
            <Input
              id="customer-business"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer-type">{t("fieldType")}</Label>
              <select
                id="customer-type"
                value={type}
                onChange={(e) => setType(e.target.value as CustomerType)}
                className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
              >
                <option value="END_CUSTOMER">{t("typeEndCustomer")}</option>
                <option value="DEALER">{t("typeDealer")}</option>
                <option value="INSTITUTION">{t("typeInstitution")}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-city">{t("fieldCity")}</Label>
              <Input
                id="customer-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-gstin">{t("fieldGstin")}</Label>
            <Input
              id="customer-gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="33ABCDE1234F1Z5"
            />
          </div>

          <Button
            type="submit"
            data-gold
            className="h-11 w-full"
            disabled={pending || !phoneE164 || !name.trim()}
          >
            {pending ? "…" : t("create")}
          </Button>
        </>
      )}
    </form>
  );
}
