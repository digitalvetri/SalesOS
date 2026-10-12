"use client";
// v1.1 §4.3 / §5.3 — the spreadsheet order sheet.
//
// Rendered server-side with initial data; a thin client layer handles the
// inline "+ New order" row, keyboard flow (Tab / Enter / Esc), the add-payment
// popover, and the status dropdown. Row updates re-fetch via router.refresh().
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import { Plus, Download } from "lucide-react";
import { toast } from "@/components/app/Toast";
import { Money } from "@/components/app/Money";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import { updateOrderFieldsV2Action } from "@/app/(app)/orders/actions-v2";
import { AddPaymentPopover } from "./AddPaymentPopover";
import { useOrderStatus } from "./useOrderForms";
import { fmtDate, PILL_STYLE, initialsOf } from "./sheetFormat";
import { OrderCard } from "./OrderCard";
import { NewOrderSheet } from "./NewOrderSheet";
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


export function OrderSheet(props: OrderSheetProps) {
  const router = useRouter();

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

  function setFilter(k: "m" | "f" | "q" | "sp" | "new", v: string | null) {
    const sp = new URLSearchParams(window.location.search);
    if (v === null || v === "" || v === (k === "f" ? "all" : null)) sp.delete(k);
    else sp.set(k, v);
    router.push(`/orders${sp.toString() ? `?${sp.toString()}` : ""}`);
  }

  // Filters live in the URL; read them via useSearchParams so this also works
  // during server rendering (where `window` does not exist).
  const searchParams = useSearchParams();
  const exportHref = React.useMemo(() => {
    const q = searchParams.toString();
    return `/orders/export${q ? `?${q}` : ""}`;
  }, [searchParams]);

  // "+ New order" opens the step-by-step form (all screen sizes).
  // /orders?new=1 (e.g. from the Overview button) opens it straight away.
  const [sheetOpen, setSheetOpen] = React.useState(() => searchParams.get("new") === "1");
  function startNewOrder() {
    setSheetOpen(true);
  }
  function closeNewOrder() {
    setSheetOpen(false);
    if (searchParams.get("new")) setFilter("new", null);
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 px-4 py-5 md:px-6 md:py-7 xl:px-8">
      {/* Toolbar */}
      <header className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {props.mode === "employee" ? "My orders" : "Orders"}
            </h1>
            <p className="mt-0.5 text-sm text-[color:var(--color-ink-3)]">
              {totals.count} orders · {totals.completed} completed
            </p>
          </div>
          <div className="flex items-center gap-2">
            {props.mode === "admin" && (
              <a
                href={exportHref}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Excel</span>
                <span className="sr-only sm:hidden">Download Excel</span>
              </a>
            )}
            <button
              type="button"
              data-gold
              onClick={startNewOrder}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold"
            >
              <Plus className="h-4 w-4" />
              New order
            </button>
          </div>
        </div>

        <div className="surface-card flex flex-col gap-3 p-3 lg:flex-row lg:flex-wrap lg:items-end">
          <SearchBox initial={props.search} onSubmit={(q) => setFilter("q", q || null)} />
          <StatusFilterBar active={props.activeStatus} onChange={(v) => setFilter("f", v)} />
          <div className="grid grid-cols-2 gap-3 lg:flex">
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
          </div>
        </div>
      </header>

      {sheetOpen && <NewOrderSheet onDone={closeNewOrder} />}

      {/* Cards (< 1024 px) */}
      <div className="lg:hidden">
        {props.rows.length === 0 ? (
          <p className="surface-card px-4 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
            No orders yet for this view. Tap <strong>New order</strong> to add one.
          </p>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2">
              {props.rows.map((r) => (
                <OrderCard key={r.id} row={r} mode={props.mode} />
              ))}
            </ul>
            <dl className="surface-card mt-4 grid grid-cols-3 gap-2 p-3 text-center text-sm">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Total</dt>
                <dd className="font-semibold"><Money value={totals.total.toString()} className="text-sm" /></dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Paid</dt>
                <dd className="font-semibold"><Money value={totals.paid.toString()} className="text-sm" /></dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Balance</dt>
                <dd className="font-semibold"><Money value={totals.balance.toString()} className="text-sm" /></dd>
              </div>
            </dl>
          </>
        )}
      </div>

      {/* Table (≥ 1024 px) */}
      <div className="surface-card hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="sticky top-0 z-10 whitespace-nowrap bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
            <tr>
              <th className="px-3 py-2 w-16">S.No</th>
              <th className="px-3 py-2 w-24">Date</th>
              {props.mode === "admin" && <th className="px-3 py-2 w-28">Employee</th>}
              <th className="px-3 py-2 w-36">Customer</th>
              <th className="px-3 py-2 min-w-[180px]">Product</th>
              <th className="px-3 py-2 w-28">Contact</th>
              <th className="px-3 py-2 w-24 text-right">Total</th>
              <th className="px-3 py-2 w-24 text-right">Paid</th>
              <th className="px-3 py-2 w-24 text-right">Balance</th>
              <th className="px-3 py-2 w-32">Status</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.length === 0 ? (
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
                  <Money value={totals.total.toString()} className="text-sm" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={totals.paid.toString()} className="text-sm" />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <Money value={totals.balance.toString()} className="text-sm" />
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
    <label className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="label-caps">Month</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base sm:text-sm lg:w-auto"
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
    <label className="flex min-w-0 flex-col gap-1 text-xs">
      <span className="label-caps">Employee</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="h-10 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base sm:text-sm lg:w-auto"
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


function StatusFilterBar({
  active,
  onChange,
}: {
  active: OrderSheetProps["activeStatus"];
  onChange: (v: OrderSheetProps["activeStatus"]) => void;
}) {
  return (
    <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 text-xs [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
      {STATUS_FILTERS.map((f) => (
        <button
          type="button"
          key={f.value}
          onClick={() => onChange(f.value)}
          aria-pressed={active === f.value}
          className={`h-10 shrink-0 whitespace-nowrap rounded-full border px-4 font-medium transition-colors ${
            active === f.value
              ? "border-transparent bg-[color:var(--color-gold-soft)] text-[color:var(--color-gold)]"
              : "border-[color:var(--color-border-strong)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
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
      className="flex min-w-0 flex-col gap-1 text-xs lg:w-72"
    >
      <span className="label-caps">Search</span>
      <input
        type="search"
        aria-label="Search orders"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Product, name, phone…"
        className="h-10 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base sm:text-sm"
      />
    </form>
  );
}

function OrderSheetRow({ row, mode }: { row: OrderV2Row; mode: Mode }) {
  const router = useRouter();
  const [showPay, setShowPay] = React.useState(false);
  const { pending, setPending, updateStatus } = useOrderStatus(row);
  const canEdit = row.simpleStatus === "PENDING";

  const [editing, setEditing] = React.useState<null | "product" | "total">(null);
  const [editValue, setEditValue] = React.useState("");

  async function commitEdit() {
    if (!editing) return;
    setPending(true);
    try {
      const args: { orderId: string; productText?: string; total?: string } = {
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
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-[color:var(--color-ink-3)]">
        {row.serialNo === null
          ? "—"
          : mode === "admin"
            ? `${initialsOf(row.salespersonName)}-${row.serialNo}`
            : row.serialNo}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-[color:var(--color-ink-2)]">
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
            aria-label="Edit product"
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
      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-[color:var(--color-ink-2)]">
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
            aria-label="Edit total"
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
          <Money value={row.total} className="text-sm font-medium" />
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <button
          type="button"
          onClick={() => row.simpleStatus !== "CANCELLED" && setShowPay(true)}
          className="hover:underline disabled:no-underline"
          disabled={row.simpleStatus === "CANCELLED"}
        >
          <Money value={row.paidTotal} className="text-sm font-medium" />
        </button>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {balanceLabel ? (
          <span className="rounded-full bg-[color:var(--color-ok-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-ok)]">
            {balanceLabel}
          </span>
        ) : (
          <span className="text-[color:var(--color-warn)]">
            <Money value={row.balanceDue} className="text-sm font-medium" />
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <select
          value={row.simpleStatus}
          aria-label={`Status of order for ${row.customerName}`}
          onChange={(e) => void updateStatus(e.target.value as "PENDING" | "COMPLETED" | "CANCELLED")}
          disabled={pending || (mode === "employee" && row.simpleStatus !== "PENDING")}
          title={mode === "employee" && row.simpleStatus !== "PENDING" ? "Only an admin can change this order" : undefined}
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
