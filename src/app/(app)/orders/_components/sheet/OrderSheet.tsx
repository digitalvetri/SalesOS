"use client";
// v1.1 §4.3 / §5.3 — the spreadsheet order sheet.
//
// Rendered server-side with initial data; a thin client layer handles the
// inline "+ New order" row, keyboard flow (Tab / Enter / Esc), the add-payment
// popover, and the status dropdown. Row updates re-fetch via router.refresh().
import * as React from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { Plus, Loader2, Download } from "lucide-react";
import { toast } from "@/components/app/Toast";
import { Money } from "@/components/app/Money";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import {
  createOrderV2Action,
  setOrderStatusV2Action,
  updateOrderFieldsV2Action,
} from "@/app/(app)/orders/actions-v2";
import { AddPaymentPopover } from "./AddPaymentPopover";
import type { OrderV2Row } from "@/server/repo/ordersV2";

type Mode = "employee" | "admin";

export type OrderSheetProps = {
  mode: Mode;
  rows: OrderV2Row[];
  months: string[];
  activeMonth: string | null; // null = "All time"
  activeStatus: "all" | "pending" | "completed" | "balance_due";
  search: string;
  // Admin-only
  employees?: Array<{ id: string; name: string }>;
  activeSalesperson?: string | null;
};

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "Asia/Kolkata",
  })
    .format(d)
    .replace(/\//g, "-");
}

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_FILTERS: {
  value: OrderSheetProps["activeStatus"];
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "balance_due", label: "Balance due" },
];

const PILL_STYLE: Record<OrderV2Row["simpleStatus"], string> = {
  PENDING: "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
  COMPLETED: "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
  CANCELLED: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
};

export function OrderSheet(props: OrderSheetProps) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);

  // Row totals for the footer.
  const totals = React.useMemo(() => {
    let total = new Decimal(0);
    let paid = new Decimal(0);
    let balance = new Decimal(0);
    let completed = 0;
    for (const r of props.rows) {
      if (r.simpleStatus === "CANCELLED") continue;
      total = total.plus(r.total);
      paid = paid.plus(r.paidTotal);
      balance = balance.plus(r.balanceDue);
      if (r.simpleStatus === "COMPLETED") completed++;
    }
    return { total, paid, balance, completed, count: props.rows.length };
  }, [props.rows]);

  function setFilter(k: "m" | "f" | "q" | "sp", v: string | null) {
    const sp = new URLSearchParams(window.location.search);
    if (v === null || v === "" || v === (k === "f" ? "all" : null)) sp.delete(k);
    else sp.set(k, v);
    router.push(`/orders${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  const exportHref = React.useMemo(() => {
    const q = new URLSearchParams(window?.location?.search ?? "");
    return `/orders/export${q.toString() ? `?${q.toString()}` : ""}`;
  }, [props.rows]); // recompute when data changes (filters already in URL)

  return (
    <div className="px-4 py-6 md:px-6">
      {/* Toolbar */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {props.mode === "employee" ? "My orders" : "Orders"}
          </h1>
          <MonthSelect
            value={props.activeMonth}
            months={props.months}
            onChange={(m) => setFilter("m", m)}
          />
          {props.mode === "admin" && props.employees && (
            <EmployeeSelect
              value={props.activeSalesperson ?? null}
              employees={props.employees}
              onChange={(v) => setFilter("sp", v)}
            />
          )}
          <StatusFilterBar active={props.activeStatus} onChange={(v) => setFilter("f", v)} />
          <SearchBox initial={props.search} onSubmit={(q) => setFilter("q", q || null)} />
        </div>
        <div className="flex items-center gap-2">
          {props.mode === "admin" && (
            <a
              href={exportHref}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              <Download className="h-4 w-4" />
              Excel
            </a>
          )}
          <button
            type="button"
            data-gold
            onClick={() => setAdding(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" />
            New order
          </button>
        </div>
      </header>

      {/* Table */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-[var(--shadow-1)]">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-10 bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
            <tr>
              <th className="px-3 py-2 w-16">S.No</th>
              <th className="px-3 py-2 w-24">Date</th>
              {props.mode === "admin" && <th className="px-3 py-2 w-32">Employee</th>}
              <th className="px-3 py-2 w-40">Customer</th>
              <th className="px-3 py-2 min-w-[220px]">Product</th>
              <th className="px-3 py-2 w-32">Contact</th>
              <th className="px-3 py-2 w-28 text-right">Total</th>
              <th className="px-3 py-2 w-28 text-right">Paid</th>
              <th className="px-3 py-2 w-28 text-right">Balance</th>
              <th className="px-3 py-2 w-32">Status</th>
            </tr>
          </thead>
          <tbody>
            {adding && (
              <NewRow mode={props.mode} onDone={() => setAdding(false)} />
            )}
            {props.rows.length === 0 && !adding ? (
              <tr>
                <td
                  colSpan={props.mode === "admin" ? 10 : 9}
                  className="px-3 py-10 text-center text-sm text-[color:var(--color-ink-3)]"
                >
                  No orders yet for this view. Click <strong>+ New order</strong> to add one.
                </td>
              </tr>
            ) : (
              props.rows.map((r) => (
                <OrderSheetRow key={r.id} row={r} mode={props.mode} />
              ))
            )}
          </tbody>
          {props.rows.length > 0 && (
            <tfoot className="bg-[color:var(--color-surface-2)] text-sm font-medium">
              <tr>
                <td
                  className="px-3 py-2 text-[color:var(--color-ink-2)]"
                  colSpan={props.mode === "admin" ? 6 : 5}
                >
                  {totals.count} orders · {totals.completed} completed
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={totals.total.toString()} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={totals.paid.toString()} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={totals.balance.toString()} />
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function MonthSelect({
  value,
  months,
  onChange,
}: {
  value: string | null;
  months: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="label-caps">Month</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
      >
        <option value="">All time</option>
        {months.map((m) => (
          <option key={m} value={m}>
            {fmtMonth(m)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmployeeSelect({
  value,
  employees,
  onChange,
}: {
  value: string | null;
  employees: Array<{ id: string; name: string }>;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="label-caps">Employee</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
      >
        <option value="">All</option>
        {employees.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

function StatusFilterBar({
  active,
  onChange,
}: {
  active: OrderSheetProps["activeStatus"];
  onChange: (v: OrderSheetProps["activeStatus"]) => void;
}) {
  return (
    <div className="flex rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-0.5 text-xs">
      {STATUS_FILTERS.map((f) => (
        <button
          type="button"
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`rounded-[calc(var(--radius)-2px)] px-3 py-1.5 font-medium transition-colors ${
            active === f.value
              ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
              : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({
  initial,
  onSubmit,
}: {
  initial: string;
  onSubmit: (q: string) => void;
}) {
  const [v, setV] = React.useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v.trim());
      }}
      className="flex flex-col gap-1 text-xs"
    >
      <span className="label-caps">Search</span>
      <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Product, name, phone…"
        className="h-10 w-64 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
      />
    </form>
  );
}

function NewRow({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const router = useRouter();
  const [productText, setProductText] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [customerName, setCustomerName] = React.useState("");
  const [totalRaw, setTotalRaw] = React.useState("");
  const [paidRaw, setPaidRaw] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const customerRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    customerRef.current?.focus();
  }, []);

  const total = parseAmount(totalRaw) ?? new Decimal(0);
  const paid = parseAmount(paidRaw) ?? new Decimal(0);
  const balance = total.minus(paid);

  async function save() {
    if (pending) return;
    // Validation copy (v1.1 §4.4)
    if (!productText.trim()) {
      toast.error("Type what the customer ordered.");
      return;
    }
    if (contact.trim().length < 10) {
      toast.error("Enter a 10-digit mobile number.");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Enter the customer's name.");
      return;
    }
    const t = parseAmount(totalRaw);
    if (!t || t.lessThanOrEqualTo(0)) {
      toast.error("Total must be more than ₹0.");
      return;
    }
    const p = parseAmount(paidRaw) ?? new Decimal(0);
    if (p.greaterThan(t)) {
      toast.error(`Paid can't be more than the total (₹${t.toFixed(0)}).`);
      return;
    }

    setPending(true);
    try {
      const r = await createOrderV2Action({
        productText: productText.trim(),
        contactPhone: contact.trim(),
        customerName: customerName.trim(),
        total: t.toFixed(2),
        paid: p.greaterThan(0) ? p.toFixed(2) : undefined,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Order #${r.data.serialNo ?? "?"} saved`);
      onDone();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (productText || contact || customerName || totalRaw || paidRaw) {
        if (!window.confirm("Discard this unsaved order?")) return;
      }
      onDone();
    }
  }

  const cell =
    "w-full border-0 bg-transparent px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-gold)]/60 rounded-md";

  return (
    <tr className="border-t border-[color:var(--color-border)] bg-[color:var(--color-gold-soft)]/50">
      <td className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "new"}
      </td>
      <td className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">
        {fmtDate(new Date())}
      </td>
      {mode === "admin" && (
        <td className="px-3 py-2 text-xs text-[color:var(--color-ink-3)]">You</td>
      )}
      <td className="px-1 py-1">
        <input
          ref={customerRef}
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          onKeyDown={onKey}
          placeholder="Sri Pack"
          disabled={pending}
          maxLength={120}
          className={cell}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={productText}
          onChange={(e) => setProductText(e.target.value)}
          onKeyDown={onKey}
          placeholder="10L tilting grinder, 6&quot; IRG"
          disabled={pending}
          maxLength={500}
          className={cell}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="tel"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={onKey}
          placeholder="98765 43210"
          disabled={pending}
          inputMode="numeric"
          className={cell}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={totalRaw}
          onChange={(e) => setTotalRaw(e.target.value)}
          onKeyDown={onKey}
          placeholder="62,500"
          disabled={pending}
          inputMode="decimal"
          className={`${cell} text-right tabular-nums`}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="text"
          value={paidRaw}
          onChange={(e) => setPaidRaw(e.target.value)}
          onKeyDown={onKey}
          placeholder="0"
          disabled={pending}
          inputMode="decimal"
          className={`${cell} text-right tabular-nums`}
        />
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-[color:var(--color-ink-3)]">
        {totalRaw ? <Money value={balance.toString()} /> : "—"}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL_STYLE.PENDING}`}>
          Pending
        </span>
      </td>
    </tr>
  );
}

function OrderSheetRow({ row, mode }: { row: OrderV2Row; mode: Mode }) {
  const router = useRouter();
  const [showPay, setShowPay] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const canEdit = row.simpleStatus === "PENDING";

  async function updateStatus(next: "PENDING" | "COMPLETED" | "CANCELLED") {
    if (pending) return;
    if (next === row.simpleStatus) return;
    if (next === "CANCELLED") {
      const reason = window.prompt("Why cancel this order? (one line)");
      if (!reason?.trim()) return;
      setPending(true);
      try {
        const r = await setOrderStatusV2Action({
          orderId: row.id,
          status: "CANCELLED",
          cancelReason: reason.trim(),
        });
        if (!r.ok) toast.error(r.error.message);
        else {
          toast.success("Order cancelled.");
          router.refresh();
        }
      } finally {
        setPending(false);
      }
      return;
    }
    setPending(true);
    try {
      const r = await setOrderStatusV2Action({ orderId: row.id, status: next });
      if (!r.ok) toast.error(r.error.message);
      else {
        toast.success(next === "COMPLETED" ? "Marked completed." : "Reopened.");
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const [editing, setEditing] = React.useState<null | "product" | "total">(null);
  const [editValue, setEditValue] = React.useState("");

  async function commitEdit() {
    if (!editing) return;
    setPending(true);
    try {
      let args: { orderId: string; productText?: string; total?: string } = {
        orderId: row.id,
      };
      if (editing === "product") {
        if (editValue.trim() === row.productText) {
          setEditing(null);
          return;
        }
        if (!editValue.trim()) {
          toast.error("Type what the customer ordered.");
          return;
        }
        args.productText = editValue.trim();
      } else if (editing === "total") {
        const p = parseAmount(editValue);
        if (!p || p.lessThanOrEqualTo(0)) {
          toast.error("Total must be more than ₹0.");
          return;
        }
        args.total = p.toFixed(2);
      }
      const r = await updateOrderFieldsV2Action(args);
      if (!r.ok) toast.error(r.error.message);
      else {
        setEditing(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  const balanceLabel = new Decimal(row.balanceDue).isZero() ? "Paid" : null;

  return (
    <tr className="border-t border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]/40">
      <td className="px-3 py-2 text-xs tabular-nums text-[color:var(--color-ink-3)]">
        {row.serialNo === null
          ? "—"
          : mode === "admin"
            ? `${initialsOf(row.salespersonName)}-${row.serialNo}`
            : row.serialNo}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-[color:var(--color-ink-2)]">
        {fmtDate(row.orderDate)}
      </td>
      {mode === "admin" && (
        <td className="px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
          <SalespersonChip name={row.salespersonName} />
        </td>
      )}
      <td className="px-3 py-2 font-medium">{row.customerName}</td>
      <td
        className="px-3 py-2 text-[color:var(--color-ink)]"
        onDoubleClick={() => {
          if (!canEdit) return;
          setEditing("product");
          setEditValue(row.productText ?? "");
        }}
      >
        {editing === "product" ? (
          <input
            type="text"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitEdit();
              if (e.key === "Escape") setEditing(null);
            }}
            className="w-full rounded border border-[color:var(--color-gold)]/40 bg-[color:var(--color-surface)] px-2 py-1 text-sm"
          />
        ) : (
          <span className={canEdit ? "cursor-text" : ""} title={canEdit ? "Double-click to edit" : undefined}>
            {row.productText ?? "—"}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs tabular-nums text-[color:var(--color-ink-2)]">
        {row.customerPhoneE164.replace(/^\+91/, "")}
      </td>
      <td
        className="px-3 py-2 text-right tabular-nums"
        onDoubleClick={() => {
          if (!canEdit) return;
          setEditing("total");
          setEditValue(row.total);
        }}
      >
        {editing === "total" ? (
          <input
            type="text"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitEdit();
              if (e.key === "Escape") setEditing(null);
            }}
            inputMode="decimal"
            className="w-24 rounded border border-[color:var(--color-gold)]/40 bg-[color:var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums"
          />
        ) : (
          <Money value={row.total} />
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <button
          type="button"
          onClick={() => row.simpleStatus !== "CANCELLED" && setShowPay(true)}
          className="hover:underline disabled:no-underline"
          disabled={row.simpleStatus === "CANCELLED"}
        >
          <Money value={row.paidTotal} />
        </button>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {balanceLabel ? (
          <span className="rounded-full bg-[color:var(--color-ok-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-ok)]">
            {balanceLabel}
          </span>
        ) : (
          <span className="text-[color:var(--color-warn)]">
            <Money value={row.balanceDue} />
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <select
          value={row.simpleStatus}
          onChange={(e) => void updateStatus(e.target.value as "PENDING" | "COMPLETED" | "CANCELLED")}
          disabled={pending}
          className={`h-7 rounded-full border-0 px-2 text-xs font-medium ${PILL_STYLE[row.simpleStatus]}`}
        >
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </td>
      {showPay && (
        <AddPaymentPopover
          orderId={row.id}
          currentBalance={row.balanceDue}
          onClose={() => setShowPay(false)}
        />
      )}
    </tr>
  );
}

function SalespersonChip({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--color-gold)]/20 text-[10px] font-bold text-[color:var(--color-gold)]">
        {initials || "—"}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
