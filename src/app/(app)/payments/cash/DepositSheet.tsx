"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/app/Money";
import { toast } from "@/components/app/Toast";
import { markDepositedAction } from "../actions";

export function DepositSheet(props: {
  paymentId: string;
  receiptNo: string;
  amount: string;
  holder: string;
  today: string;
  accounts: { id: string; label: string }[]; // order's entity accounts first
}) {
  const t = useTranslations("payments");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [accountId, setAccountId] = React.useState(props.accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(props.today);
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    try {
      const r = await markDepositedAction({ paymentId: props.paymentId, accountId, depositedOn: date });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("depositedToast", { receipt: props.receiptNo }));
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="outline" size="sm">
          {t("markDeposited")}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 rounded-t-[var(--radius-lg)] border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-2)]",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">{t("depositTitle")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-[color:var(--color-ink-2)]">
                {props.receiptNo} · <Money value={props.amount} /> · {t("withPerson", { name: props.holder })}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]" aria-label={t("close")}>
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`dep-acc-${props.paymentId}`}>{t("depositAccount")}</Label>
              <select
                id={`dep-acc-${props.paymentId}`}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
              >
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`dep-date-${props.paymentId}`}>{t("depositDate")}</Label>
              <Input
                id={`dep-date-${props.paymentId}`}
                type="date"
                value={date}
                max={props.today}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <DialogPrimitive.Close asChild>
              <Button variant="outline" className="flex-1">
                {t("cancel")}
              </Button>
            </DialogPrimitive.Close>
            <Button className="flex-1" disabled={pending || !accountId || !date} onClick={save}>
              {pending ? "…" : t("markDeposited")}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
