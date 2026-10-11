"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/app/Toast";
import { updateAccountAction } from "./actions";
import type { AccountKind } from "@/server/repo/client";

export function AccountRow({
  account,
}: {
  account: {
    id: string;
    label: string;
    kind: AccountKind;
    last4: string | null;
    active: boolean;
    entityCode: string;
  };
}) {
  const t = useTranslations("settings.accounts");
  const [pending, setPending] = React.useState(false);

  const kindLabel =
    account.kind === "BANK" ? t("kindBank") : account.kind === "UPI" ? t("kindUpi") : t("kindCash");

  async function toggleActive() {
    setPending(true);
    try {
      const r = await updateAccountAction({ id: account.id, active: !account.active });
      if (!r.ok) toast.error(r.error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <tr className="border-t border-[color:var(--color-border)]">
      <td className="px-4 py-3 font-medium">{account.entityCode}</td>
      <td className="px-4 py-3">{account.label}</td>
      <td className="px-4 py-3">{kindLabel}</td>
      <td className="px-4 py-3 tabular-nums">{account.last4 ?? "—"}</td>
      <td className="px-4 py-3">{account.active ? "✓" : "—"}</td>
      <td className="px-4 py-3 text-right">
        <Button
          size="sm"
          variant={account.active ? "danger" : "default"}
          onClick={toggleActive}
          disabled={pending}
        >
          {account.active ? t("deactivate") : t("activate")}
        </Button>
      </td>
    </tr>
  );
}
