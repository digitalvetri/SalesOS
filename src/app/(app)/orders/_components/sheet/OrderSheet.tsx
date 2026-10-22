"use client";
// v1.1 §4.3 / §5.3 — the spreadsheet order sheet.
//
// Laid out like the client's Excel order book: one block per month (newest
// month first, dates ascending inside a month) with a SUBTOTAL row per month,
// so the numbers can be compared with the TOTAL rows in the sheet. Admins pick
// an employee from the chip row (?sp=<userId>) to see that person's sheet.
//
// Rendered server-side with initial data; a thin client layer handles the
// "+ New order" form, inline edits, the add-payment popover and the status
// dropdown. Row updates re-fetch via router.refresh().
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Decimal from "decimal.js";
import { Plus, Download, Users, ArrowRight, Pencil } from "lucide-react";
import { toast } from "@/components/app/Toast";
import { formatInr } from "@/lib/formatInr";
import { amountMissing, groupByMonth, summarise, type MoneySummary } from "@/lib/orderDisplay";
import { parseAmount } from "@/server/domain/v1_1/amountParser";
import { updateOrderFieldsV2Action } from "@/app/(app)/orders/actions-v2";
import { AddPaymentPopover } from "./AddPaymentPopover";
import { ProductionBadge } from "@/components/app/ProductionBadge";
import { useOrderStatus } from "./useOrderForms";
import { fmtDate, fmtMonth, deliveryText, PILL_STYLE, initialsOf } from "./sheetFormat";
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
  employees?: Array<{ id: string; name: string; count: number }>;
  allCount?: number;
  activeSalesperson?: string | null;
};

const STATUS_FILTERS: {
  value: OrderSheetProps["activeStatus"];
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Delivered" },
  { value: "balance_due", label: "Balance due" },
];

// Shared cell padding / sticky first column.
const TD = "px-2 py-2 align-top";
const STICKY =
  "sticky left-0 z-[1] bg-[color:var(--color-surface)] shadow-[1px_0_0_var(--color-border)]";

export function OrderSheet(props: OrderSheetProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // "All" (admin, no employee picked) shows an Employee column; a single
  // employee's view looks like their own Excel sheet.
  const showEmployee = props.mode === "admin" && !props.activeSalesperson;
  const activeEmployee = props.employees?.find((e) => e.id === props.activeSalesperson) ?? null;

  const summary = React.useMemo(() => summarise(props.rows), [props.rows]);
  const groups = React.useMemo(() => groupByMonth(props.rows), [props.rows]);
  const completed = React.useMemo(
    () => props.rows.filter((r) => r.simpleStatus === "DELIVERED").length,
    [props.rows],
  );

  function hrefWith(k: "m" | "f" | "q" | "sp" | "new", v: string | null) {
    const sp = new URLSearchParams(searchParams.toString());
    if (v === null || v === "" || (k === "f" && v === "all")) sp.delete(k);
    else sp.set(k, v);
    return `/orders${sp.toString() ? `?${sp.toString()}` : ""}`;
  }
  function setFilter(k: "m" | "f" | "q" | "sp" | "new", v: string | null) {
    router.push(hrefWith(k, v));
  }

  const exportHref = React.useMemo(() => {
    const q = searchParams.toString();
    return `/orders/export${q ? `?${q}` : ""}`;
  }, [searchParams]);

  // "+ New order" opens the step-by-step form (all screen sizes).
  // /orders?new=1 (e.g. from the Overview button) opens it straight away.
  const [sheetOpen, setSheetOpen] = React.useState(() => searchParams.get("new") === "1");
  function closeNewOrder() {
    setSheetOpen(false);
    if (searchParams.get("new")) setFilter("new", null);
  }

  // Column count for colSpans: S.No, Date, [Employee], Customer, Contact,
  // Products, Total, Adv, Bal, Delivery, Status, Acc details.
  const colsBeforeMoney = showEmployee ? 6 : 5;
  const colCount = colsBeforeMoney + 6;

  // Show a "scroll sideways" hint only when the table is wider than its card.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = React.useState(false);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showEmployee, props.rows.length]);

  const title =
    props.mode === "employee" ? "My orders" : activeEmployee ? `${activeEmployee.name}’s orders` : "Orders";

  return (
    <div className="mx-auto w-full max-w-[1800px] min-w-0 px-4 py-5 md:px-6 md:py-7">
      {/* Title + actions */}
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-0.5 text-sm text-[color:var(--color-ink-3)]">
            {props.rows.length} orders · {completed} delivered
            {props.activeMonth ? ` · ${fmtMonth(props.activeMonth)}` : " · All time"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
          >
            <Download className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Export to Excel</span>
            <span className="sr-only sm:hidden">Export to Excel</span>
          </a>
          <button
            type="button"
            data-gold
            onClick={() => setSheetOpen(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New order
          </button>
        </div>
      </header>

      {/* Admin: pick an employee */}
      {props.mode === "admin" && props.employees && (
        <EmployeePicker
          employees={props.employees}
          allCount={props.allCount ?? props.rows.length}
          active={props.activeSalesperson ?? null}
          hrefFor={(id) => hrefWith("sp", id)}
        />
      )}

      {/* Filters */}
      <div className="surface-card mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:flex-wrap lg:items-end">
        <SearchBox initial={props.search} onSubmit={(q) => setFilter("q", q || null)} />
        <StatusFilterBar active={props.activeStatus} onChange={(v) => setFilter("f", v)} />
        <MonthSelect value={props.activeMonth} months={props.months} onChange={(m) => setFilter("m", m)} />
      </div>

      <SummaryStrip s={summary} />

      {sheetOpen && <NewOrderSheet onDone={closeNewOrder} />}

      {/* Cards (< 1024 px) */}
      <div className="lg:hidden">
        {props.rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map((g) => {
              const sub = summarise(g.rows);
              return (
                <section key={g.month} aria-label={fmtMonth(g.month)}>
                  <h2 className="mb-2 flex items-baseline justify-between gap-2 px-1 text-sm font-semibold">
                    <span>{fmtMonth(g.month)}</span>
                    <span className="text-xs font-normal text-[color:var(--color-ink-3)]">{g.rows.length} orders</span>
                  </h2>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {g.rows.map((r) => (
                      <OrderCard key={r.id} row={r} mode={props.mode} showEmployee={showEmployee} />
                    ))}
                  </ul>
                  <dl className="mt-2 grid grid-cols-3 gap-2 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-2.5 text-center">
                    <SubtotalCell label="Subtotal" value={sub.total} />
                    <SubtotalCell label="Paid" value={sub.paid} />
                    <SubtotalCell label="Balance" value={sub.balance} />
                  </dl>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Table (≥ 1024 px) — scrolls sideways inside its card, never clips. */}
      {overflowing && (
        <p className="mb-1.5 hidden items-center justify-end gap-1 text-xs text-[color:var(--color-ink-3)] lg:flex">
          Scroll the table sideways for every column
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </p>
      )}
      <div
        ref={scrollRef}
        className="surface-card hidden min-w-0 overflow-x-auto lg:block"
        role="region"
        aria-label="Orders table"
        tabIndex={0}
      >
        <table className={`w-full table-fixed border-separate border-spacing-0 text-sm ${showEmployee ? "min-w-[1256px]" : "min-w-[1160px]"}`}>
          <colgroup>
            <col className="w-[52px]" />
            <col className="w-[76px]" />
            {showEmployee && <col className="w-[96px]" />}
            <col className="w-[140px]" />
            <col className="w-[108px]" />
            <col />
            <col className="w-[88px]" />
            <col className="w-[88px]" />
            <col className="w-[88px]" />
            <col className="w-[84px]" />
            <col className="w-[120px]" />
            <col className="w-[120px]" />
          </colgroup>
          <thead className="text-left text-[11px] uppercase tracking-wide text-[color:var(--color-ink-3)]">
            <tr className="[&>th]:border-b [&>th]:border-[color:var(--color-border)] [&>th]:bg-[color:var(--color-surface-2)] [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold">
              <th scope="col" className="sticky left-0 z-[2]">S.No</th>
              <th scope="col">Date</th>
              {showEmployee && <th scope="col">Employee</th>}
              <th scope="col">Customer</th>
              <th scope="col">Contact</th>
              <th scope="col">Products</th>
              <th scope="col" className="text-right">Total</th>
              <th scope="col" className="text-right">Adv</th>
              <th scope="col" className="text-right">Bal</th>
              <th scope="col">Delivery</th>
              <th scope="col">Status · Production</th>
              <th scope="col">Acc details</th>
            </tr>
          </thead>
          {props.rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
                  No orders for this view. Click <strong>New order</strong> to add one.
                </td>
              </tr>
            </tbody>
          ) : (
            groups.map((g) => {
              const sub = summarise(g.rows);
              return (
                <tbody key={g.month}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={colCount}
                      className="border-b border-[color:var(--color-border)] bg-[color:var(--color-gold-soft)] p-0 text-left"
                    >
                      <span className="sticky left-0 inline-block px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-[color:var(--color-gold)]">
                        {fmtMonth(g.month)}
                        <span className="ml-2 font-medium normal-case tracking-normal text-[color:var(--color-ink-2)]">
                          {g.rows.length} orders
                        </span>
                      </span>
                    </th>
                  </tr>
                  {g.rows.map((r) => (
                    <OrderSheetRow key={r.id} row={r} mode={props.mode} showEmployee={showEmployee} />
                  ))}
                  <SubtotalRow
                    label={`${fmtMonth(g.month)} subtotal`}
                    s={sub}
                    colsBefore={colsBeforeMoney}
                    colsAfter={3}
                  />
                </tbody>
              );
            })
          )}
          {groups.length > 1 && (
            <tfoot>
              <SubtotalRow label="Grand total" s={summary} colsBefore={colsBeforeMoney} colsAfter={3} strong />
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

function EmptyState() {
  return (
    <p className="surface-card px-4 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
      No orders for this view. Tap <strong>New order</strong> to add one.
    </p>
  );
}

function money(n: number | string) {
  return formatInr(n);
}

function EmployeePicker({
  employees,
  allCount,
  active,
  hrefFor,
}: {
  employees: Array<{ id: string; name: string; count: number }>;
  allCount: number;
  active: string | null;
  hrefFor: (id: string | null) => string;
}) {
  const chip = (isActive: boolean) =>
    `inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-gold)] ${
      isActive
        ? "border-[color:var(--color-gold)] bg-[color:var(--color-gold)] text-[color:var(--color-gold-ink)]"
        : "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
    }`;
  const badge = (isActive: boolean) =>
    `rounded-full px-1.5 py-px text-xs tabular-nums ${
      isActive
        ? "bg-[color:var(--color-surface)] text-[color:var(--color-gold)]"
        : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]"
    }`;
  return (
    <nav aria-label="Employee" className="mb-4">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
        <Users className="h-3.5 w-3.5" aria-hidden />
        Employee
      </div>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <li>
          <Link href={hrefFor(null)} aria-current={active === null ? "page" : undefined} className={chip(active === null)}>
            All
            <span className={badge(active === null)}>{allCount}</span>
          </Link>
        </li>
        {employees.map((e) => {
          const on = active === e.id;
          return (
            <li key={e.id}>
              <Link href={hrefFor(e.id)} aria-current={on ? "page" : undefined} className={chip(on)}>
                {e.name}
                <span className={badge(on)}>{e.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SummaryStrip({ s }: { s: MoneySummary }) {
  const items: { label: string; value: React.ReactNode; tone?: string }[] = [
    {
      label: "Orders",
      value: (
        <>
          {s.orders}
          {s.cancelled > 0 && (
            <span className="ml-1.5 text-xs font-normal text-[color:var(--color-ink-3)]">+{s.cancelled} cancelled</span>
          )}
        </>
      ),
    },
    { label: "Total value", value: money(s.total) },
    { label: "Paid", value: money(s.paid), tone: "text-[color:var(--color-ok)]" },
    { label: "Balance", value: money(s.balance), tone: s.balance > 0 ? "text-[color:var(--color-warn)]" : undefined },
    { label: "No amount", value: s.noAmount, tone: s.noAmount > 0 ? "text-[color:var(--color-ink-2)]" : undefined },
  ];
  return (
    <dl className="surface-card mb-4 grid grid-cols-2 divide-[color:var(--color-border)] sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
      {items.map((it, i) => (
        <div key={it.label} className={`min-w-0 px-4 py-3 ${i === 0 ? "col-span-2 sm:col-span-1" : ""}`}>
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
            {it.label}
            {it.label === "No amount" && <span className="sr-only"> (orders with a blank total in the sheet)</span>}
          </dt>
          <dd
            className={`mt-0.5 truncate text-lg font-bold tabular-nums ${it.tone ?? ""}`}
            title={it.label === "No amount" ? "Orders whose TOTAL was blank in the sheet — counted, not summed" : undefined}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SubtotalCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{money(value)}</dd>
    </div>
  );
}

function SubtotalRow({
  label,
  s,
  colsBefore,
  colsAfter,
  strong,
}: {
  label: string;
  s: MoneySummary;
  colsBefore: number;
  colsAfter: number;
  strong?: boolean;
}) {
  const cell = `border-b border-[color:var(--color-border)] px-2.5 py-2 ${
    strong ? "bg-[color:var(--color-surface-2)] font-bold" : "bg-[color:var(--color-surface-2)] font-semibold"
  }`;
  return (
    <tr className="text-sm">
      <th scope="row" colSpan={colsBefore} className={`${cell} text-left`}>
        <span className="sticky left-2.5 inline-flex flex-wrap items-baseline gap-x-2">
          <span className="uppercase tracking-wide text-xs">{label}</span>
          <span className="text-xs font-normal text-[color:var(--color-ink-2)]">
            {s.orders} orders
            {s.noAmount > 0 && ` · ${s.noAmount} without amount`}
            {s.cancelled > 0 && ` · ${s.cancelled} cancelled (not counted)`}
          </span>
        </span>
      </th>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{money(s.total)}</td>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums`}>{money(s.paid)}</td>
      <td className={`${cell} whitespace-nowrap text-right tabular-nums text-[color:var(--color-warn)]`}>{money(s.balance)}</td>
      <td colSpan={colsAfter} className={cell} />
    </tr>
  );
}

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

function StatusFilterBar({
  active,
  onChange,
}: {
  active: OrderSheetProps["activeStatus"];
  onChange: (v: OrderSheetProps["activeStatus"]) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Status"
      className="-mx-3 flex gap-1.5 overflow-x-auto px-3 text-xs [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
    >
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
        placeholder="Customer, contact, product, notes…"
        className="h-10 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base sm:text-sm"
      />
    </form>
  );
}

function OrderSheetRow({ row, mode, showEmployee }: { row: OrderV2Row; mode: Mode; showEmployee: boolean }) {
  const router = useRouter();
  const [showPay, setShowPay] = React.useState(false);
  const { pending, setPending, updateStatus } = useOrderStatus(row);
  const canEdit = row.simpleStatus === "PENDING";
  const cancelled = row.simpleStatus === "CANCELLED";
  const blank = amountMissing(row);

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

  const paidUp = !blank && new Decimal(row.balanceDue).isZero();
  const sheetStatus = row.sheetRow?.status?.trim() || null;
  const acc = row.accDetails?.trim() || row.sheetRow?.acc?.trim() || null;
  const delivery = deliveryText(row);
  const sno =
    row.serialNo === null ? "—" : showEmployee ? `${initialsOf(row.salespersonName)}-${row.serialNo}` : String(row.serialNo);

  return (
    <tr
      className={`group [&>td]:border-b [&>td]:border-[color:var(--color-border)] hover:[&>td]:bg-[color:var(--color-surface-2)] ${
        cancelled ? "text-[color:var(--color-ink-3)]" : ""
      }`}
    >
      <td className={`${TD} ${STICKY} whitespace-nowrap text-xs tabular-nums text-[color:var(--color-ink-3)]`}>{sno}</td>
      <td
        className={`${TD} whitespace-nowrap text-xs tabular-nums text-[color:var(--color-ink-2)]`}
        title={row.sheetRow?.date ? `Sheet: ${row.sheetRow.date}` : undefined}
      >
        {fmtDate(row.orderDate)}
      </td>
      {showEmployee && (
        <td className={`${TD} overflow-hidden text-xs text-[color:var(--color-ink-2)]`}>
          <SalespersonChip name={row.salespersonName} />
        </td>
      )}
      <td className={`${TD} font-medium`}>
        <Link
          href={`/orders/${row.id}`}
          className="line-clamp-2 break-words hover:text-[color:var(--color-gold)] hover:underline"
          title={`Open order — ${row.customerLabel}`}
        >
          {row.customerLabel}
        </Link>
      </td>
      <td className={`${TD} text-xs tabular-nums text-[color:var(--color-ink-2)]`}>
        <span className="line-clamp-2 break-words" title={row.contactLabel}>
          {row.contactLabel}
        </span>
      </td>
      <td
        className={`${TD} text-[color:var(--color-ink)]`}
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
          <span
            className={`line-clamp-3 break-words ${canEdit ? "cursor-text" : ""}`}
            title={[row.productText ?? "", canEdit ? "(double-click to edit)" : ""].filter(Boolean).join("\n") || undefined}
          >
            {row.productText ?? "—"}
          </span>
        )}
      </td>
      <td
        className={`${TD} whitespace-nowrap text-right tabular-nums`}
        onDoubleClick={() => {
          if (!canEdit) return;
          setEditing("total");
          setEditValue(blank ? "" : row.total);
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
            className="w-full rounded border border-[color:var(--color-gold)]/40 bg-[color:var(--color-surface)] px-1.5 py-1 text-right text-sm tabular-nums"
          />
        ) : blank ? (
          <Blank title="No total in the sheet" />
        ) : (
          <span className="font-medium">{money(row.total)}</span>
        )}
      </td>
      <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>
        <button
          type="button"
          onClick={() => !cancelled && setShowPay(true)}
          className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 decoration-dotted underline-offset-4 hover:bg-[color:var(--color-surface-2)] hover:underline disabled:no-underline"
          disabled={cancelled}
          aria-label={cancelled ? undefined : `Payments for ${row.customerLabel}`}
          title={cancelled ? undefined : "See, edit or add payments"}
        >
          {blank ? <Blank /> : <span className="font-medium">{money(row.paidTotal)}</span>}
          {!cancelled && <Pencil className="h-3 w-3 text-[color:var(--color-ink-3)]" aria-hidden />}
        </button>
      </td>
      <td className={`${TD} whitespace-nowrap text-right tabular-nums`}>
        {blank ? (
          <Blank />
        ) : paidUp ? (
          <span className="rounded-full bg-[color:var(--color-ok-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-ok)]">
            Paid
          </span>
        ) : (
          <span className="font-medium text-[color:var(--color-warn)]">{money(row.balanceDue)}</span>
        )}
      </td>
      <td className={`${TD} text-xs text-[color:var(--color-ink-2)]`}>
        <span className="line-clamp-2 break-words" title={delivery}>
          {delivery}
        </span>
      </td>
      <td className={TD}>
        <select
          value={row.simpleStatus}
          aria-label={`Status of order for ${row.customerLabel}`}
          onChange={(e) => void updateStatus(e.target.value as "PENDING" | "DELIVERED" | "CANCELLED")}
          disabled={pending || (mode === "employee" && row.simpleStatus !== "PENDING")}
          title={mode === "employee" && row.simpleStatus !== "PENDING" ? "Only an admin can change this order" : undefined}
          className={`h-7 w-full max-w-[112px] rounded-full border-0 pl-2 pr-1 text-xs font-medium ${PILL_STYLE[row.simpleStatus]}`}
        >
          <option value="PENDING">Pending</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {row.simpleStatus !== "CANCELLED" && <ProductionBadge status={row.productionStatus} className="mt-1" />}
        {sheetStatus && (
          <span
            className="mt-1 line-clamp-2 break-words text-[11px] leading-tight text-[color:var(--color-ink-3)]"
            title={`Status in the sheet: ${sheetStatus}`}
          >
            {sheetStatus}
          </span>
        )}
      </td>
      <td className={`${TD} text-xs text-[color:var(--color-ink-2)]`}>
        <span className="line-clamp-2 break-words" title={acc ?? undefined}>
          {acc ?? "—"}
        </span>
      </td>
      {showPay && (
        <AddPaymentPopover
          orderId={row.id}
          customerLabel={row.customerLabel}
          total={row.total}
          paidTotal={row.paidTotal}
          currentBalance={row.balanceDue}
          canChange={mode === "admin" || row.simpleStatus === "PENDING"}
          onClose={() => setShowPay(false)}
        />
      )}
    </tr>
  );
}

function Blank({ title }: { title?: string }) {
  return (
    <span className="text-[color:var(--color-ink-3)]" title={title}>
      —<span className="sr-only">{title ?? "no amount"}</span>
    </span>
  );
}

function SalespersonChip({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5" title={name}>
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-gold-soft)] text-[10px] font-bold text-[color:var(--color-gold)]">
        {initialsOf(name)}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}
