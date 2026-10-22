"use client";
// "Payments" window for one order (opened from the Paid cell on the orders list):
// every payment received, each with Edit (amount / mode / date / account) and Delete,
// plus Add payment. Server rules decide who may change what; `canChange` only hides
// buttons that would be refused anyway.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { formatInr } from "@/lib/formatInr";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import {
  addPaymentV2Action,
  deletePaymentV2Action,
  listOrderPaymentsAction,
  updatePaymentV2Action,
} from "@/app/(app)/orders/actions-v2";
import { SHEET_CONTENT, SHEET_OVERLAY, fmtDate } from "./sheetFormat";

type Method = "CASH" | "UPI" | "BANK_TRANSFER" | "CHEQUE";
const METHODS: { v: Method; label: string }[] = [
  { v: "UPI", label: "UPI" },
  { v: "BANK_TRANSFER", label: "Bank" },
  { v: "CHEQUE", label: "Cheque" },
  { v: "CASH", label: "Cash" },
];
const METHOD_LABEL: Record<string, string> = { UPI: "UPI", BANK_TRANSFER: "Bank", CHEQUE: "Cheque", CASH: "Cash", CARD: "Card" };

type Pay = { id: string; type: string; amount: string; method: string; paidOn: string; note: string };

// Today's date in India (the date input expects YYYY-MM-DD).
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const plain = (v: string) => new Decimal(v).toDecimalPlaces(2).toString();
const selectCls =
  "h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base";

export function AddPaymentPopover({
  orderId,
  customerLabel,
  total,
  paidTotal,
  currentBalance,
  canChange,
  onClose,
}: {
  orderId: string;
  customerLabel?: string;
  total: string;
  paidTotal: string;
  currentBalance: string;
  canChange: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [payments, setPayments] = React.useState<Pay[] | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const apply = React.useCallback((r: Awaited<ReturnType<typeof listOrderPaymentsAction>>, first = false) => {
    if (r.ok) {
      setPayments(r.data.payments);
      // Open the add form by itself only when the window first opens on an order with no payments.
      if (first && r.data.payments.length === 0) setAdding(true);
    } else {
      toast.error(r.error.message);
      setPayments([]);
    }
  }, []);
  const load = React.useCallback(async () => apply(await listOrderPaymentsAction({ orderId })), [apply, orderId]);

  React.useEffect(() => {
    let alive = true;
    listOrderPaymentsAction({ orderId }).then((r) => alive && apply(r, true));
    return () => {
      alive = false;
    };
  }, [apply, orderId]);

  async function afterChange(msg: string) {
    toast.success(msg);
    setEditingId(null);
    setAdding(false);
    await load();
    router.refresh();
  }

  async function remove(p: Pay) {
    if (!window.confirm(`Delete the payment of ${formatInr(p.amount)} on ${fmtDate(new Date(p.paidOn))}? The balance goes up by the same amount.`)) return;
    setBusy(true);
    try {
      const r = await deletePaymentV2Action({ paymentId: p.id });
      if (!r.ok) toast.error(r.error.message);
      else await afterChange("Payment deleted.");
    } finally {
      setBusy(false);
    }
  }

  const balanceNum = new Decimal(currentBalance);

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SHEET_OVERLAY} />
        <DialogPrimitive.Content className={SHEET_CONTENT}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-lg font-semibold">Payments</DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-xs text-[color:var(--color-ink-3)]">
                {customerLabel ? `${customerLabel} · ` : ""}money received on this order
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label="Close" className="rounded-full p-1 hover:bg-[color:var(--color-surface-2)]">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </div>

          {/* Totals */}
          <dl className="mb-4 grid grid-cols-3 gap-2 rounded-[var(--radius)] bg-[color:var(--color-surface-2)] p-3 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Total</dt>
              <dd className="text-sm font-semibold tabular-nums">{formatInr(total)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Received</dt>
              <dd className="text-sm font-semibold tabular-nums text-[color:var(--color-ok)]">{formatInr(paidTotal)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Balance</dt>
              <dd className={`text-sm font-semibold tabular-nums ${balanceNum.isZero() ? "text-[color:var(--color-ok)]" : "text-[color:var(--color-warn)]"}`}>
                {balanceNum.isZero() ? "Paid" : formatInr(currentBalance)}
              </dd>
            </div>
          </dl>

          {/* Payment list */}
          {payments === null ? (
            <p className="flex items-center gap-2 py-4 text-sm text-[color:var(--color-ink-3)]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
            </p>
          ) : payments.length === 0 ? (
            <p className="mb-2 text-sm text-[color:var(--color-ink-3)]">No payments yet.</p>
          ) : (
            <ul className="mb-3 divide-y divide-[color:var(--color-border)] rounded-[var(--radius)] border border-[color:var(--color-border)]">
              {payments.map((p, i) =>
                editingId === p.id ? (
                  <li key={p.id} className="p-3">
                    <PaymentForm
                      initial={{ amount: plain(p.amount), method: p.method as Method, paidOn: p.paidOn, note: p.note }}
                      submitLabel="Save changes"
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (v) => {
                        const r = await updatePaymentV2Action({ paymentId: p.id, ...v, note: v.note || null });
                        if (!r.ok) return r.error.message;
                        await afterChange("Payment updated.");
                        return null;
                      }}
                    />
                  </li>
                ) : (
                  <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-semibold tabular-nums">
                          {p.type === "REFUND" ? "− " : ""}
                          {formatInr(p.amount)}
                        </span>
                        <span className="text-xs text-[color:var(--color-ink-3)]">
                          {i === 0 && p.type === "ADVANCE" ? "Advance" : p.type === "REFUND" ? "Refund" : "Payment"}
                        </span>
                      </div>
                      <div className="text-xs text-[color:var(--color-ink-2)]">
                        {fmtDate(new Date(p.paidOn))} · {METHOD_LABEL[p.method] ?? p.method}
                        {p.note ? ` · ${p.note}` : ""}
                      </div>
                    </div>
                    {canChange && (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          disabled={busy || editingId !== null}
                          onClick={() => {
                            setAdding(false);
                            setEditingId(p.id);
                          }}
                          aria-label={`Edit payment of ${formatInr(p.amount)}`}
                          className="inline-flex h-9 items-center gap-1 rounded-full border border-[color:var(--color-border-strong)] px-3 text-xs font-medium hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)] disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy || editingId !== null}
                          onClick={() => void remove(p)}
                          aria-label={`Delete payment of ${formatInr(p.amount)}`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border-strong)] text-[color:var(--color-ink-3)] hover:border-[color:var(--color-danger)] hover:text-[color:var(--color-danger)] disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    )}
                  </li>
                ),
              )}
            </ul>
          )}

          {!canChange && payments && payments.length > 0 && (
            <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
              This order is closed — ask your admin to correct its payments.
            </p>
          )}

          {/* Add payment */}
          {adding ? (
            <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] p-3">
              <p className="mb-3 text-sm font-semibold">Add payment</p>
              <PaymentForm
                key={currentBalance}
                initial={{
                  amount: balanceNum.greaterThan(0) ? balanceNum.toDecimalPlaces(2, Decimal.ROUND_DOWN).toString() : "",
                  method: "UPI",
                  paidOn: today(),
                  note: "",
                }}
                submitLabel="Save payment"
                onCancel={payments && payments.length > 0 ? () => setAdding(false) : onClose}
                onSubmit={async (v) => {
                  const r = await addPaymentV2Action({ orderId, amount: v.amount, method: v.method, paidOn: v.paidOn, note: v.note || undefined });
                  if (!r.ok) return r.error.message;
                  await afterChange("Payment added.");
                  return null;
                }}
              />
            </div>
          ) : (
            balanceNum.greaterThan(0) &&
            editingId === null && (
              <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setAdding(true)}>
                <Plus className="h-4 w-4" /> Add payment
              </Button>
            )
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type FormValues = { amount: string; method: Method; paidOn: string; note: string };

function PaymentForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: FormValues;
  submitLabel: string;
  /** Returns an error message, or null on success. */
  onSubmit: (v: FormValues) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    setError(null);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const a = parseAmount(v.amount);
    if (!a || a.lessThanOrEqualTo(0)) {
      setError("Enter the amount received (more than ₹0).");
      return;
    }
    setPending(true);
    try {
      const err = await onSubmit({ ...v, amount: a.toFixed(2), note: v.note.trim() });
      if (err) setError(err);
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="pf-amount">Amount received ₹</Label>
        <Input
          id="pf-amount"
          value={v.amount}
          onChange={(e) => set("amount", e.target.value)}
          inputMode="decimal"
          autoFocus
          placeholder="0"
          className="text-lg font-semibold tabular-nums"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pf-method">Mode</Label>
          <select id="pf-method" value={v.method} onChange={(e) => set("method", e.target.value as Method)} className={selectCls}>
            {METHODS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-date">Date</Label>
          <Input id="pf-date" type="date" value={v.paidOn} max={today()} onChange={(e) => set("paidOn", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pf-note">
          Account name <span className="font-normal text-[color:var(--color-ink-3)]">(optional)</span>
        </Label>
        <Input id="pf-note" value={v.note} onChange={(e) => set("note", e.target.value)} maxLength={200} placeholder="e.g. KUMAR GPAY" />
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-[color:var(--color-danger)]">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 flex-1" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" data-gold className="h-11 flex-1" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : submitLabel}
        </Button>
      </div>
    </form>
  );
}
