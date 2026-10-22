"use client";
// Order page editing: the order's details (incl. where the payment was received)
// and each payment's date / method / account. Same rules as the server:
// admins edit anything; employees edit their own pending orders.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/app/Toast";
import { deletePaymentV2Action, updateOrderFieldsV2Action, updatePaymentV2Action } from "../actions-v2";
import { parseAmount } from "@/server/domain/v1_1/amountParser";

export type EditableOrder = {
  id: string;
  customerName: string;
  contact: string;
  productText: string;
  total: string; // "" when the sheet had no amount
  deliveryDate: string; // YYYY-MM-DD or ""
  orderDate: string; // YYYY-MM-DD
  accDetails: string;
  notes: string;
};

const fieldCls = "space-y-1.5";
const labelCls = "block text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]";
const textareaCls =
  "min-h-[72px] w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-base";

export function EditOrderButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-[color:var(--color-accent)] bg-[color:var(--color-surface)] px-4 text-sm font-semibold text-[color:var(--color-accent)] hover:bg-[color:var(--color-gold-soft)]"
    >
      <Pencil className="h-4 w-4" aria-hidden /> Edit order
    </button>
  );
}

/** Wraps the read-only order card; swaps it for a form while editing. */
export function OrderEditable({
  order, isAdmin, showMoney, enabled, children,
}: { order: EditableOrder; isAdmin: boolean; showMoney: boolean; enabled: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [f, setF] = React.useState(order);
  const [pending, setPending] = React.useState(false);
  const set = (k: keyof EditableOrder) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const total = f.total.replace(/[₹,\s]/g, "");
    if (showMoney && total && !/^\d{1,10}(\.\d{1,2})?$/.test(total)) {
      toast.error("Enter the total as a number.");
      return;
    }
    setPending(true);
    try {
      const r = await updateOrderFieldsV2Action({
        orderId: order.id,
        ...(f.customerName.trim() !== order.customerName ? { customerName: f.customerName.trim() } : {}),
        ...(f.contact !== order.contact ? { contact: f.contact.trim() || null } : {}),
        ...(f.productText.trim() && f.productText !== order.productText ? { productText: f.productText.trim() } : {}),
        ...(showMoney && total && total !== order.total ? { total } : {}),
        ...(f.deliveryDate !== order.deliveryDate ? { deliveryDate: f.deliveryDate || null } : {}),
        ...(isAdmin && f.orderDate && f.orderDate !== order.orderDate ? { orderDate: f.orderDate } : {}),
        ...(f.accDetails !== order.accDetails ? { accDetails: f.accDetails.trim() || null } : {}),
        ...(f.notes !== order.notes ? { notes: f.notes.trim() || null } : {}),
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Order saved.");
      setEditing(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!enabled) return <>{children}</>;
  if (!editing) {
    return (
      <div className="relative">
        <div className="absolute right-0 top-0">
          <EditOrderButton onClick={() => { setF(order); setEditing(true); }} />
        </div>
        {children}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Edit order</h2>
        <button type="button" onClick={() => setEditing(false)} aria-label="Cancel editing" className="rounded-full p-1.5 text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)]">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={fieldCls}>
          <span className={labelCls}>Customer</span>
          <Input value={f.customerName} onChange={set("customerName")} maxLength={120} />
        </label>
        <label className={fieldCls}>
          <span className={labelCls}>Contact</span>
          <Input value={f.contact} onChange={set("contact")} inputMode="tel" maxLength={120} placeholder="98765 43210" />
        </label>
      </div>
      <label className={`${fieldCls} block`}>
        <span className={labelCls}>Products</span>
        <textarea value={f.productText} onChange={set("productText")} maxLength={500} className={textareaCls} />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        {showMoney && (
          <label className={fieldCls}>
            <span className={labelCls}>Total (₹)</span>
            <Input value={f.total} onChange={set("total")} inputMode="decimal" placeholder="Not entered" />
          </label>
        )}
        <label className={fieldCls}>
          <span className={labelCls}>Delivery date</span>
          <Input type="date" value={f.deliveryDate} onChange={set("deliveryDate")} />
        </label>
        {isAdmin && (
          <label className={fieldCls}>
            <span className={labelCls}>Order date</span>
            <Input type="date" value={f.orderDate} onChange={set("orderDate")} />
          </label>
        )}
      </div>
      <label className={`${fieldCls} block`}>
        <span className={labelCls}>Payment received in (account)</span>
        <Input value={f.accDetails} onChange={set("accDetails")} maxLength={200} placeholder="e.g. KUMAR GPAY, KFM account, Cash" />
        <span className="block text-xs text-[color:var(--color-ink-3)]">The account / person the customer&apos;s money was sent to.</span>
      </label>
      <label className={`${fieldCls} block`}>
        <span className={labelCls}>Comments</span>
        <textarea value={f.notes} onChange={set("notes")} maxLength={1000} className={textareaCls} />
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
        <Button type="submit" gold disabled={pending} className="flex-1">{pending ? "…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

const METHODS = [
  ["UPI", "UPI"],
  ["CASH", "Cash"],
  ["BANK_TRANSFER", "Bank"],
  ["CHEQUE", "Cheque"],
] as const;

/** One payment row with an inline editor (date, method, account received in). */
export function PaymentRow({
  payment, canEdit, children,
}: {
  payment: { id: string; amount: string; method: string; paidOn: string; note: string };
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [amount, setAmount] = React.useState(String(Number(payment.amount)));
  const [method, setMethod] = React.useState(payment.method);
  const [paidOn, setPaidOn] = React.useState(payment.paidOn);
  const [note, setNote] = React.useState(payment.note);
  const [pending, setPending] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const a = parseAmount(amount);
    if (!a || a.lessThanOrEqualTo(0)) {
      toast.error("Enter the amount received. To remove this payment, use Delete.");
      return;
    }
    setPending(true);
    try {
      const r = await updatePaymentV2Action({
        paymentId: payment.id,
        amount: a.toFixed(2),
        method: method as (typeof METHODS)[number][0],
        paidOn,
        note: note.trim() || null,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Payment saved.");
      setEditing(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete this payment of ₹${Number(payment.amount).toLocaleString("en-IN")}? The balance will go up by the same amount.`)) return;
    setPending(true);
    try {
      const r = await deletePaymentV2Action({ paymentId: payment.id });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Payment deleted.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <li className="flex items-start gap-2 py-2 text-sm">
        <div className="min-w-0 flex-1">{children}</div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              aria-label="Edit payment"
              title="Edit amount, mode, date"
              className="inline-flex h-9 items-center gap-1 rounded-full border border-[color:var(--color-border-strong)] px-3 text-xs font-medium text-[color:var(--color-ink-2)] hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={pending}
              aria-label="Delete payment"
              title="Delete this payment"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border-strong)] text-[color:var(--color-ink-3)] hover:border-[color:var(--color-danger)] hover:text-[color:var(--color-danger)]"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </li>
    );
  }
  return (
    <li className="py-3">
      <form onSubmit={save} className="space-y-3 rounded-[var(--radius)] bg-[color:var(--color-surface-2)] p-3">
        <label className={`${fieldCls} block`}>
          <span className={labelCls}>Amount received ₹</span>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="text-lg font-semibold tabular-nums" autoFocus />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={fieldCls}>
            <span className={labelCls}>Date</span>
            <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
          <label className={fieldCls}>
            <span className={labelCls}>Method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
            >
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className={`${fieldCls} block`}>
          <span className={labelCls}>Received in (account)</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. KUMAR GPAY" />
        </label>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
          <Button type="submit" gold size="sm" disabled={pending} className="flex-1">{pending ? "…" : "Save"}</Button>
        </div>
      </form>
    </li>
  );
}
