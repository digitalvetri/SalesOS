"use client";
// "New order" form — used on every screen size (full-height sheet on phones,
// centred dialog from 640 px). Three short steps: Customer → Order → Payment.
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Loader2, Plus, Search, UserCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/app/Money";
import { cn } from "@/lib/utils";
import { normalizeMobile, useNewOrderForm, type PaymentMethod } from "./useOrderForms";
import { SHEET_OVERLAY } from "./sheetFormat";

type CustomerHit = { id: string; name: string; phoneE164: string; city: string | null; ordersCount: number };
type ProductHit = { id: string; name: string; spec: string | null; customerPrice: string | null };

const METHODS: { v: PaymentMethod; label: string }[] = [
  { v: "UPI", label: "UPI" },
  { v: "BANK_TRANSFER", label: "Bank" },
  { v: "CHEQUE", label: "Cheque" },
  { v: "CASH", label: "Cash" },
];

/** Debounced JSON search; returns [] for queries shorter than `min`. */
function useSearch<T>(
  url: (q: string) => string,
  q: string,
  min: number,
  onHits?: (hits: T[], q: string) => void,
): { hits: T[]; loading: boolean } {
  const [hits, setHits] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(false);
  const urlRef = React.useRef(url);
  const onHitsRef = React.useRef(onHits);
  React.useEffect(() => {
    urlRef.current = url;
    onHitsRef.current = onHits;
  });
  React.useEffect(() => {
    if (q.length < min) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(urlRef.current(q), { signal: ctrl.signal, cache: "no-store" });
        const body = (await res.json()) as { ok: boolean; data?: { hits: T[] } };
        const next = body.ok && body.data ? body.data.hits : [];
        setHits(next);
        onHitsRef.current?.(next, q);
      } catch {
        /* aborted or offline — keep last hits */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q, min]);
  return { hits: q.length < min ? [] : hits, loading: q.length >= min && loading };
}

function fmtMobile(d: string) {
  return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-gold-soft)] text-xs font-bold text-[color:var(--color-gold)]">
          {n}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-xs text-[color:var(--color-ink-3)]">{hint}</span>}
      </div>
      <div className="space-y-3 sm:pl-8">{children}</div>
    </section>
  );
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} role="alert" className="text-xs font-medium text-[color:var(--color-danger)]">
      {msg}
    </p>
  );
}

export function NewOrderSheet({ onDone }: { onDone: () => void }) {
  const {
    phone,
    setPhone,
    customerName,
    setCustomerName,
    items,
    addItem,
    removeItem,
    itemQuery,
    setItemQuery,
    totalRaw,
    setTotalRaw,
    paidRaw,
    setPaidRaw,
    method,
    setMethod,
    orderDate,
    setOrderDate,
    deliveryDate,
    setDeliveryDate,
    accDetails,
    setAccDetails,
    notes,
    setNotes,
    readyStock,
    setReadyStock,
    total,
    paid,
    balance,
    errors,
    pending,
    dirty,
    save,
  } = useNewOrderForm(onDone);

  const phoneRef = React.useRef<HTMLInputElement>(null);
  const [matched, setMatched] = React.useState<CustomerHit | null>(null);

  // An exact 10-digit match is treated as the existing customer automatically.
  const customers = useSearch<CustomerHit>(
    (q) => `/api/customers/search?phone=${encodeURIComponent(q)}`,
    matched ? "" : phone,
    3,
    (hits, q) => {
      if (q.length !== 10) return;
      const exact = hits.find((h) => normalizeMobile(h.phoneE164) === q);
      if (!exact) return;
      setMatched(exact);
      if (!customerName.trim()) setCustomerName(exact.name);
    },
  );
  const products = useSearch<ProductHit>(
    (q) => `/api/products/search?q=${encodeURIComponent(q)}`,
    itemQuery.trim(),
    2,
  );

  function pickCustomer(c: CustomerHit) {
    setMatched(c);
    setPhone(c.phoneE164);
    setCustomerName(c.name);
  }

  function requestClose() {
    if (dirty && !pending && !window.confirm("Discard this unsaved order?")) return;
    onDone();
  }

  const showCustomerHits = !matched && phone.length >= 3 && customers.hits.length > 0;
  const showProductHits = itemQuery.trim().length >= 2;

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && requestClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={SHEET_OVERLAY} />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            phoneRef.current?.focus();
          }}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[96svh] flex-col rounded-t-[24px] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] shadow-[var(--shadow-2)] focus:outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90svh] sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-lg)]"
        >
          {/* Header */}
          <div className="shrink-0 border-b border-[color:var(--color-border)] px-5 pb-4 pt-3 sm:pt-5">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[color:var(--color-border-strong)] sm:hidden" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogPrimitive.Title className="text-lg font-bold">New order</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-[color:var(--color-ink-3)]">
                  Customer, what they ordered, delivery date and the amount received.
                </DialogPrimitive.Description>
              </div>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="rounded-full p-1.5 hover:bg-[color:var(--color-surface-2)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <form
            id="new-order-form"
            noValidate
            className="flex-1 space-y-6 overflow-y-auto px-5 py-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            {/* 1 · Customer */}
            <Step n={1} title="Customer">
              <div className="space-y-1.5">
                <Label htmlFor="no-phone">Mobile number</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-[color:var(--color-ink-3)]">
                    +91
                  </span>
                  <Input
                    id="no-phone"
                    ref={phoneRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="off"
                    value={fmtMobile(phone)}
                    onChange={(e) => {
                      setMatched(null);
                      setPhone(e.target.value);
                    }}
                    placeholder="e.g. 98765 43210"
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? "err-phone" : undefined}
                    className={cn("pl-12 tabular-nums", errors.phone && "border-[color:var(--color-danger)]")}
                    disabled={pending}
                  />
                  {customers.loading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[color:var(--color-ink-3)]" />
                  )}
                </div>
                <FieldError id="err-phone" msg={errors.phone} />
                {matched && (
                  <p className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--color-ok-bg)] px-2.5 py-1 text-xs font-medium text-[color:var(--color-ok)]">
                    <UserCheck className="h-3.5 w-3.5" aria-hidden />
                    Existing customer · {matched.ordersCount} {matched.ordersCount === 1 ? "order" : "orders"}
                  </p>
                )}
                {showCustomerHits && (
                  <ul className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)]" aria-label="Matching customers">
                    {customers.hits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => pickCustomer(c)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{c.name}</span>
                            <span className="block text-xs tabular-nums text-[color:var(--color-ink-3)]">
                              {fmtMobile(normalizeMobile(c.phoneE164))}
                              {c.city ? ` · ${c.city}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-[color:var(--color-gold)]">Use</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="no-customer">Customer / business name</Label>
                <Input
                  id="no-customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Sri Pack"
                  maxLength={120}
                  aria-invalid={Boolean(errors.customerName)}
                  aria-describedby={errors.customerName ? "err-customer" : undefined}
                  className={cn(errors.customerName && "border-[color:var(--color-danger)]")}
                  disabled={pending}
                />
                <FieldError id="err-customer" msg={errors.customerName} />
              </div>
            </Step>

            {/* 2 · Order */}
            <Step n={2} title="What did they order?">
              {items.length > 0 && (
                <ul className="flex flex-wrap gap-2" aria-label="Items in this order">
                  {items.map((it) => (
                    <li
                      key={it.name}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[color:var(--color-gold-soft)] py-1 pl-3 pr-1 text-sm text-[color:var(--color-gold)]"
                    >
                      <span className="truncate">{it.name}</span>
                      {it.price && <Money value={it.price} className="text-xs opacity-80" />}
                      <button
                        type="button"
                        onClick={() => removeItem(it.name)}
                        aria-label={`Remove ${it.name}`}
                        className="rounded-full p-1 hover:bg-[color:var(--color-surface)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="no-item" className="sr-only">
                  Search the price list or type an item
                </Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-ink-3)]" />
                  <Input
                    id="no-item"
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && itemQuery.trim()) {
                        e.preventDefault();
                        addItem({ name: itemQuery, price: null });
                      }
                    }}
                    placeholder={items.length ? "Add another item…" : 'Search price list, e.g. "grinder"'}
                    maxLength={200}
                    aria-invalid={Boolean(errors.items)}
                    aria-describedby={errors.items ? "err-items" : undefined}
                    className={cn("pl-9", errors.items && "border-[color:var(--color-danger)]")}
                    disabled={pending}
                  />
                </div>
                <FieldError id="err-items" msg={errors.items} />
                {showProductHits && (
                  <ul className="max-h-56 overflow-y-auto rounded-[var(--radius)] border border-[color:var(--color-border)]" aria-label="Price list matches">
                    {products.hits.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => addItem({ name: p.name, price: p.customerPrice })}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-[color:var(--color-surface-2)]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{p.name}</span>
                            {p.spec && <span className="block truncate text-xs text-[color:var(--color-ink-3)]">{p.spec}</span>}
                          </span>
                          {p.customerPrice && <Money value={p.customerPrice} className="shrink-0 text-sm" />}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        onClick={() => addItem({ name: itemQuery, price: null })}
                        className="flex w-full items-center gap-2 border-t border-[color:var(--color-border)] px-3 py-2.5 text-left text-sm text-[color:var(--color-gold)] hover:bg-[color:var(--color-surface-2)]"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        Add “{itemQuery.trim()}” as typed
                      </button>
                    </li>
                  </ul>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="no-total">Order total ₹</Label>
                <Input
                  id="no-total"
                  inputMode="decimal"
                  value={totalRaw}
                  onChange={(e) => setTotalRaw(e.target.value)}
                  placeholder="e.g. 62,500"
                  aria-invalid={Boolean(errors.total)}
                  aria-describedby={errors.total ? "err-total" : "hint-total"}
                  className={cn("text-lg font-semibold tabular-nums", errors.total && "border-[color:var(--color-danger)]")}
                  disabled={pending}
                />
                {errors.total ? (
                  <FieldError id="err-total" msg={errors.total} />
                ) : (
                  <p id="hint-total" className="text-xs text-[color:var(--color-ink-3)]">
                    Filled from the price list — change it if you agreed a different price.
                  </p>
                )}
              </div>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border p-3 transition-colors",
                  readyStock
                    ? "border-[color:var(--color-gold)] bg-[color:var(--color-gold-soft)]"
                    : "border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[color:var(--color-accent)]"
                  checked={readyStock}
                  onChange={(e) => setReadyStock(e.target.checked)}
                  disabled={pending}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">From ready stock</span>
                  <span className="block text-xs text-[color:var(--color-ink-3)]">
                    The item is already available — this order won&apos;t go to the production team.
                  </span>
                </span>
              </label>
            </Step>

            {/* 3 · Dates + comments */}
            <Step n={3} title="Dates & comments">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="no-date">Order date</Label>
                  <Input
                    id="no-date"
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    aria-invalid={Boolean(errors.orderDate)}
                    className={cn(errors.orderDate && "border-[color:var(--color-danger)]")}
                    disabled={pending}
                  />
                  <FieldError id="err-date" msg={errors.orderDate} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="no-delivery">Delivery date</Label>
                  <Input
                    id="no-delivery"
                    type="date"
                    value={deliveryDate}
                    min={orderDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    aria-invalid={Boolean(errors.deliveryDate)}
                    className={cn(errors.deliveryDate && "border-[color:var(--color-danger)]")}
                    disabled={pending}
                  />
                  <FieldError id="err-delivery" msg={errors.deliveryDate} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="no-notes">Comments</Label>
                <textarea
                  id="no-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="e.g. Deliver with stand, call before dispatch"
                  className="w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 py-2 text-base"
                  disabled={pending}
                />
              </div>
            </Step>

            {/* 4 · Payment */}
            <Step n={4} title="Payment received" hint="optional">
              <div className="space-y-1.5">
                <Label htmlFor="no-paid">Amount received ₹</Label>
                <Input
                  id="no-paid"
                  inputMode="decimal"
                  value={paidRaw}
                  onChange={(e) => setPaidRaw(e.target.value)}
                  placeholder="0"
                  aria-invalid={Boolean(errors.paid)}
                  aria-describedby={errors.paid ? "err-paid" : undefined}
                  className={cn("tabular-nums", errors.paid && "border-[color:var(--color-danger)]")}
                  disabled={pending}
                />
                <FieldError id="err-paid" msg={errors.paid} />
              </div>
              {/* Always visible so the employee sees the choice; it is only saved with an amount. */}
              <div className="space-y-1.5">
                  <span className="text-sm font-medium">Payment mode</span>
                  <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment mode">
                    {METHODS.map((m) => (
                      <button
                        key={m.v}
                        type="button"
                        role="radio"
                        aria-checked={method === m.v}
                        onClick={() => setMethod(m.v)}
                        className={cn(
                          "h-10 rounded-[var(--radius)] border text-sm font-medium transition-colors",
                          method === m.v
                            ? "border-[color:var(--color-gold)] bg-[color:var(--color-gold-soft)] text-[color:var(--color-gold)]"
                            : "border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-surface-2)]",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="no-acc">
                  Account name <span className="font-normal text-[color:var(--color-ink-3)]">(optional)</span>
                </Label>
                <Input
                  id="no-acc"
                  value={accDetails}
                  onChange={(e) => setAccDetails(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. KUMAR GPAY, KFM account"
                  disabled={pending}
                />
              </div>
            </Step>
          </form>

          {/* Summary + actions (always visible) */}
          <div className="shrink-0 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 sm:rounded-b-[var(--radius-lg)] sm:pb-4">
            <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Total</dt>
                <dd className="text-sm font-semibold"><Money value={total.toString()} className="text-sm" /></dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Received</dt>
                <dd className="text-sm font-semibold"><Money value={paid.toString()} className="text-sm" /></dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Balance</dt>
                <dd className="text-sm font-semibold text-[color:var(--color-warn)]">
                  {total.greaterThan(0) && balance.isZero() ? (
                    <span className="inline-flex items-center gap-1 text-[color:var(--color-ok)]">
                      <Check className="h-3.5 w-3.5" /> Paid
                    </span>
                  ) : (
                    <Money value={balance.toString()} className="text-sm" />
                  )}
                </dd>
              </div>
            </dl>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="h-12 flex-1" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" form="new-order-form" data-gold className="h-12 flex-[2] text-base font-semibold" disabled={pending}>
                {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                {pending ? "Saving…" : "Save order"}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
