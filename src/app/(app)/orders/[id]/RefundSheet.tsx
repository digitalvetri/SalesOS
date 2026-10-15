"use client";
// Refund flow for cancelled orders (§5.1, §5.2): pays back a negative balance.
// Shown to Owner/Admin/Accounts when the order carries "Refund due".
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Decimal from "decimal.js";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/app/Money";
import { toast } from "@/components/app/Toast";
import { parseAmount } from "@/lib/parseAmount";
import type { PaymentMethod } from "@/server/repo/client";
import { recordRefundAction } from "../../payments/actions";

const METHODS: PaymentMethod[] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"];

export function RefundSheet(props: {
  orderId: string;
  orderNumber: string;
  refundDue: string; // positive amount owed back
  today: string;
  accounts: { id: string; label: string }[];
  gold: boolean;
}) {
  const t = useTranslations("refund");
  const tm = useTranslations("recordPayment.methods");
  const router = useRouter();
  const due = new Decimal(props.refundDue);

  const [open, setOpen] = React.useState(false);
  const [key, setKey] = React.useState(() => crypto.randomUUID());
  const [amountRaw, setAmountRaw] = React.useState(due.toFixed(0));
  const [method, setMethod] = React.useState<PaymentMethod>("BANK_TRANSFER");
  const [accountId, setAccountId] = React.useState(props.accounts[0]?.id ?? "");
  const [date, setDate] = React.useState(props.today);
  const [reference, setReference] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const amount = parseAmount(amountRaw);
  const tooMuch = amount !== null && amount.minus(due).greaterThan(1);
  const canSave = !pending && amount !== null && amount.greaterThan(0) && !tooMuch && Boolean(accountId);

  async function save() {
    if (!canSave || !amount) return;
    setPending(true);
    try {
      const r = await recordRefundAction({
        idempotencyKey: key,
        orderId: props.orderId,
        amount: amount.toString(),
        method,
        paidOn: date,
        accountId,
        referenceNo: reference.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("saved", { receipt: r.data.receiptNo }));
      setOpen(false);
      setKey(crypto.randomUUID());
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button className="h-12 w-full text-base" {...(props.gold && !open ? { "data-gold": "true" } : {})}>
          {t("open")}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92svh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-2)]",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border",
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">{t("title")}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-xs text-[color:var(--color-ink-3)]">
                {props.orderNumber}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]" aria-label={t("close")}>
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="mt-3 flex items-baseline justify-between rounded-[var(--radius)] bg-[color:var(--color-surface-2)] px-3 py-2">
            <span className="text-sm">{t("due")}</span>
            <Money value={props.refundDue} size="lg" />
          </div>
          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-amount">{t("amount")}</Label>
              <Input
                id="refund-amount"
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                inputMode="decimal"
                className="text-lg tabular-nums"
                aria-invalid={tooMuch}
              />
              {tooMuch && <p className="text-xs text-[color:var(--color-danger)]">{t("errTooMuch")}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-date">{t("date")}</Label>
              <Input id="refund-date" type="date" value={date} max={props.today} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label id="refund-method-label">{t("method")}</Label>
              <div role="radiogroup" aria-labelledby="refund-method-label" className="grid grid-cols-4 gap-2">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={method === m}
                    onClick={() => setMethod(m)}
                    className={cn(
                      "h-11 rounded-[var(--radius)] border text-sm",
                      method === m
                        ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium"
                        : "border-[color:var(--color-border-strong)]",
                    )}
                  >
                    {tm(m)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-from">{t("paidFrom")}</Label>
              <select
                id="refund-from"
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
              <Label htmlFor="refund-ref">{t("reference")}</Label>
              <Input id="refund-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} />
            </div>
          </div>
          <Button data-gold="true" className="mt-6 h-12 w-full text-base" disabled={!canSave} onClick={save}>
            {pending ? t("saving") : t("save")}
          </Button>
          <p className="mt-2 text-center text-xs text-[color:var(--color-ink-3)]">{t("footer")}</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
