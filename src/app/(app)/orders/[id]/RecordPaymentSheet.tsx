"use client";
// §11.5 Record payment — bottom sheet on the order detail. [GOLD] = "Save payment".
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Decimal from "decimal.js";
import { Camera, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/app/Money";
import { toast } from "@/components/app/Toast";
import { parseAmount } from "@/lib/parseAmount";
import { compressImage } from "@/lib/compressImage";
import type { PaymentMethod } from "@/server/repo/client";
import { recordPaymentAction } from "../../payments/actions";

type Opt = { id: string; label: string };

export type RecordPaymentSheetProps = {
  orderId: string;
  orderNumber: string;
  balanceDue: string;
  today: string; // YYYY-MM-DD in IST, from the server
  accounts: Opt[]; // active accounts of the order's billing entity
  receiveStaff: Opt[];
  actor: { id: string; canReceivePayments: boolean };
  gold: boolean;
};

const METHODS: PaymentMethod[] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"];
const OVERPAY_TOLERANCE = new Decimal(1);

export function RecordPaymentSheet(props: RecordPaymentSheetProps) {
  const t = useTranslations("recordPayment");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button className="h-12 w-full text-base" {...(props.gold && !open ? { "data-gold": "true" } : {})}>
          ₹ {t("open")}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 max-h-[92svh] overflow-y-auto rounded-t-[var(--radius-lg)] border-t border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-2)]",
            "md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[var(--radius-lg)] md:border",
          )}
        >
          {open && (
            <SheetBody
              {...props}
              onDone={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function defaultReceiver(method: PaymentMethod, p: RecordPaymentSheetProps): string {
  const me = p.actor.canReceivePayments ? `user:${p.actor.id}` : null;
  const firstAccount = p.accounts[0] ? `account:${p.accounts[0].id}` : null;
  if (method === "CASH") return me ?? firstAccount ?? "";
  return firstAccount ?? me ?? "";
}

function SheetBody(p: RecordPaymentSheetProps & { onDone: () => void }) {
  const t = useTranslations("recordPayment");
  const balance = new Decimal(p.balanceDue);

  // One key per sheet opening: a retried submit (flaky network) replays instead of double-recording.
  const [idempotencyKey] = React.useState(() => crypto.randomUUID());
  const [amountRaw, setAmountRaw] = React.useState(balance.toFixed(0));
  const [paidOn, setPaidOn] = React.useState(p.today);
  const [method, setMethod] = React.useState<PaymentMethod>("UPI");
  const [receivedInto, setReceivedInto] = React.useState(() => defaultReceiver("UPI", p));
  const [intoTouched, setIntoTouched] = React.useState(false);
  const [reference, setReference] = React.useState("");
  const [proof, setProof] = React.useState<{ blob: Blob; url: string } | null>(null);
  const [compressing, setCompressing] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => {
    if (proof) URL.revokeObjectURL(proof.url);
  }, [proof]);

  const amount = parseAmount(amountRaw);
  const isFull = amount !== null && amount.equals(balance);
  const amountError =
    amountRaw.trim() === ""
      ? null
      : amount === null || !amount.greaterThan(0)
        ? t("errAmount")
        : amount.minus(balance).greaterThan(OVERPAY_TOLERANCE)
          ? t("errOverpay")
          : null;
  const canSave =
    !pending && !compressing && amount !== null && amount.greaterThan(0) && !amountError && Boolean(receivedInto) && Boolean(paidOn);

  function pickMethod(m: PaymentMethod) {
    setMethod(m);
    if (!intoTouched) setReceivedInto(defaultReceiver(m, p));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCompressing(true);
    try {
      const blob = await compressImage(file);
      setProof({ blob, url: URL.createObjectURL(blob) });
    } catch {
      toast.error(t("errImage"));
    } finally {
      setCompressing(false);
    }
  }

  async function save() {
    if (!canSave || !amount) return;
    setPending(true);
    try {
      let proofPath: string | null = null;
      if (proof) {
        const res = await fetch(`/api/payments/proof?orderId=${encodeURIComponent(p.orderId)}`, {
          method: "POST",
          headers: { "Content-Type": proof.blob.type || "image/jpeg" },
          body: proof.blob,
        });
        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { path: string } }
          | { ok: false; error: { message: string } }
          | null;
        if (!json || !json.ok) {
          toast.error(json && !json.ok ? json.error.message : t("errUpload"));
          return;
        }
        proofPath = json.data.path;
      }

      const r = await recordPaymentAction({
        idempotencyKey,
        orderId: p.orderId,
        amount: amount.toString(),
        method,
        paidOn,
        receivedInto,
        referenceNo: reference.trim() || null,
        proofPath,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(t("saved", { receipt: r.data.receiptNo }));
      p.onDone();
    } finally {
      setPending(false);
    }
  }

  const refLabel = method === "CHEQUE" ? t("chequeNo") : t("reference");

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <DialogPrimitive.Title className="text-lg font-semibold text-[color:var(--color-ink)]">
            {t("title")}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-xs text-[color:var(--color-ink-3)]">
            {p.orderNumber}
          </DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close
          className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]"
          aria-label={t("close")}
        >
          <X className="h-5 w-5" />
        </DialogPrimitive.Close>
      </div>

      <div className="mt-3 flex items-baseline justify-between rounded-[var(--radius)] bg-[color:var(--color-surface-2)] px-3 py-2">
        <span className="text-sm">{t("balanceDue")}</span>
        <Money value={p.balanceDue} size="lg" />
      </div>

      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pay-amount">{t("amount")}</Label>
          <div className="flex gap-2">
            <Input
              id="pay-amount"
              value={amountRaw}
              onChange={(e) => setAmountRaw(e.target.value)}
              inputMode="decimal"
              className="flex-1 text-lg tabular-nums"
              aria-invalid={Boolean(amountError)}
              aria-describedby={amountError ? "pay-amount-err" : undefined}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setAmountRaw(balance.toFixed(0))}
              aria-pressed={isFull}
              className={cn(
                "h-11 shrink-0 rounded-[var(--radius)] border px-3 text-sm",
                isFull
                  ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium"
                  : "border-[color:var(--color-border-strong)]",
              )}
            >
              {t("full")}
              {isFull ? " ✓" : ""}
            </button>
          </div>
          {amountError && (
            <p id="pay-amount-err" className="text-xs text-[color:var(--color-danger)]">
              {amountError}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pay-date">{t("date")}</Label>
          <Input
            id="pay-date"
            type="date"
            value={paidOn}
            max={p.today}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label id="pay-method-label">{t("method")}</Label>
          <div role="radiogroup" aria-labelledby="pay-method-label" className="grid grid-cols-4 gap-2">
            {METHODS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => pickMethod(m)}
                className={cn(
                  "h-11 rounded-[var(--radius)] border text-sm",
                  method === m
                    ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium"
                    : "border-[color:var(--color-border-strong)]",
                )}
              >
                {t(`methods.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="pay-into">{t("receivedInto")}</Label>
          <select
            id="pay-into"
            value={receivedInto}
            onChange={(e) => {
              setReceivedInto(e.target.value);
              setIntoTouched(true);
            }}
            className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
          >
            {p.accounts.length > 0 && (
              <optgroup label={t("companyAccounts")}>
                {p.accounts.map((a) => (
                  <option key={a.id} value={`account:${a.id}`}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            )}
            {p.receiveStaff.length > 0 && (
              <optgroup label={t("person")}>
                {p.receiveStaff.map((u) => (
                  <option key={u.id} value={`user:${u.id}`}>
                    {u.id === p.actor.id ? t("me", { name: u.label }) : u.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {receivedInto.startsWith("user:") && (
            <p className="text-xs text-[color:var(--color-warn)]">{t("personalHint")}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pay-ref">{refLabel}</Label>
          <Input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={80}
            autoComplete="off"
          />
        </div>

        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label={t("proof")}
            onChange={onFile}
          />
          {proof ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img
                src={proof.url}
                alt={t("proofPreview")}
                className="h-16 w-16 rounded-[var(--radius)] border border-[color:var(--color-border)] object-cover"
              />
              <div className="flex-1 text-xs text-[color:var(--color-ink-3)]">
                {Math.round(proof.blob.size / 1024)} KB
              </div>
              <Button variant="ghost" size="sm" onClick={() => setProof(null)}>
                {t("removeProof")}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileRef.current?.click()}
              disabled={compressing}
            >
              <Camera className="h-4 w-4" />
              {compressing ? t("compressing") : t("proof")}
            </Button>
          )}
        </div>
      </div>

      <Button
        data-gold="true"
        className="mt-6 h-12 w-full text-base"
        disabled={!canSave}
        onClick={save}
      >
        {pending ? t("saving") : t("save")}
      </Button>
      <p className="mt-2 text-center text-xs text-[color:var(--color-ink-3)]">
        {method === "CHEQUE" ? t("chequeFooter") : t("footer")}
      </p>
    </div>
  );
}
