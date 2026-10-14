"use client";
// Production board rows: a table from 1024 px, stacked cards below (production
// staff mostly use phones — big tap targets). One-tap status buttons call
// setProductionStatusAction and refresh the page. No money anywhere.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, Hammer, PackageCheck, Phone, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "@/components/app/Toast";
import { ProductionBadge } from "@/components/app/ProductionBadge";
import { PRODUCTION_LABEL, type ProductionStatus } from "@/server/domain/v1_1/workflow";
import { fmtDate, initialsOf } from "@/app/(app)/orders/_components/sheet/sheetFormat";
import type { ProductionRow, ProductionTab } from "@/server/repo/production";
import { setProductionStatusAction } from "./actions";
import { deliveryBadge, type DeliveryTone } from "./deliveryBadge";

type Props = {
  rows: ProductionRow[];
  tab: ProductionTab;
  /** IST "YYYY-MM-DD" from the server, so server and client agree on "today". */
  todayKey: string;
  /** OWNER / ADMIN may open the order page. */
  linkOrders: boolean;
};

type ActionDef = { to: ProductionStatus; label: string; primary: boolean; icon: React.ReactNode };

function actionsFor(tab: ProductionTab): ActionDef[] {
  switch (tab) {
    case "todo":
      return [{ to: "IN_PROGRESS", label: "Start · On progress", primary: true, icon: <Hammer className="h-4 w-4" aria-hidden /> }];
    case "progress":
      return [
        { to: "FINISHED", label: "Mark Finished", primary: true, icon: <PackageCheck className="h-4 w-4" aria-hidden /> },
        { to: "NOT_STARTED", label: "Back to Not started", primary: false, icon: <RotateCcw className="h-4 w-4" aria-hidden /> },
      ];
    case "finished":
      return [{ to: "IN_PROGRESS", label: "Undo (On progress)", primary: false, icon: <RotateCcw className="h-4 w-4" aria-hidden /> }];
    case "delivered":
      return [];
  }
}

const TONE_STYLE: Record<DeliveryTone, string> = {
  overdue: "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
  today: "bg-[#FFF4DB] text-[#8A5A00]",
  soon: "bg-[color:var(--color-gold-soft)] text-[color:var(--color-gold)]",
  later: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]",
  none: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
};

const TD = "px-2.5 py-3 align-top";

/** S.No is per salesperson, so show it with their initials ("SN-9") like the orders export. */
const sno = (r: ProductionRow) => (r.serialNo === null ? null : `${initialsOf(r.salesperson)}-${r.serialNo}`);

export function ProductionBoard({ rows, tab, todayKey, linkOrders }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null); // order id being updated
  const actions = actionsFor(tab);
  const showBadge = tab !== "delivered";

  async function setStatus(row: ProductionRow, to: ProductionStatus) {
    if (busy) return;
    setBusy(row.id);
    try {
      const r = await setProductionStatusAction({ orderId: row.id, status: to });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`${row.customer === "—" ? "Order" : row.customer}: ${PRODUCTION_LABEL[to]}`);
      router.refresh();
    } catch {
      toast.error("Couldn't update. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="surface-card px-4 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
        No orders here right now.
      </p>
    );
  }

  const buttons = (row: ProductionRow, full: boolean) =>
    actions.length > 0 && (
      <div className={`flex gap-2 ${full ? "flex-col sm:flex-row" : "flex-col"}`}>
        {actions.map((a) => (
          <button
            key={a.to}
            type="button"
            disabled={busy !== null}
            onClick={() => setStatus(row, a.to)}
            className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full text-sm leading-tight font-semibold transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-gold)] ${
              full ? "w-full whitespace-nowrap px-4 sm:w-auto sm:flex-1" : "w-full px-3 py-1.5 text-center"
            } ${
              a.primary
                ? "bg-[color:var(--color-accent)] text-[color:var(--color-gold-ink)] hover:bg-[color:var(--color-accent-hover)]"
                : "border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:border-[color:var(--color-gold)]"
            }`}
          >
            {busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : a.icon}
            {a.label}
          </button>
        ))}
      </div>
    );

  const customerCell = (row: ProductionRow) =>
    linkOrders ? (
      <Link href={`/orders/${row.id}`} className="font-semibold text-[color:var(--color-gold)] underline-offset-2 hover:underline">
        {row.customer}
      </Link>
    ) : (
      <span className="font-semibold">{row.customer}</span>
    );

  const phoneCell = (row: ProductionRow, big: boolean) =>
    row.tel ? (
      <a
        href={`tel:${row.tel}`}
        className={`inline-flex items-center gap-1.5 text-[color:var(--color-gold)] underline-offset-2 hover:underline ${
          big ? "min-h-11 rounded-full border border-[color:var(--color-border-strong)] px-3 text-sm font-medium no-underline" : ""
        }`}
      >
        <Phone className="h-4 w-4 shrink-0" aria-hidden />
        <span className={big ? "break-all" : "whitespace-nowrap"}>{row.contact}</span>
      </a>
    ) : (
      <span className="text-[color:var(--color-ink-3)]">{row.contact}</span>
    );

  const deliveryCell = (row: ProductionRow) => {
    const b = deliveryBadge(row.deliveryDate, todayKey);
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="font-semibold tabular-nums">
          {row.deliveryDate ? fmtDate(row.deliveryDate) : (row.deliveryNote ?? "—")}
        </span>
        {showBadge && (
          <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_STYLE[b.tone]}`}>
            {b.label}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Cards (< 1024 px) */}
      <ul className="grid gap-3 sm:grid-cols-2 lg:hidden">
        {rows.map((row) => {
          const b = deliveryBadge(row.deliveryDate, todayKey);
          return (
            <li
              key={row.id}
              className={`surface-card flex flex-col gap-3 p-4 ${
                showBadge && b.tone === "overdue" ? "!border-l-4 !border-l-[color:var(--color-warn-fill)]" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-[color:var(--color-ink-3)]">
                    {sno(row) ? `S.No ${sno(row)} · ` : ""}Ordered {fmtDate(row.orderDate)}
                  </div>
                  <div className="mt-0.5 text-base">{customerCell(row)}</div>
                </div>
                <ProductionBadge status={row.productionStatus} />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4 text-[color:var(--color-ink-3)]" aria-hidden />
                <span className="font-semibold tabular-nums">
                  {row.deliveryDate ? fmtDate(row.deliveryDate) : (row.deliveryNote ?? "No delivery date")}
                </span>
                {showBadge && row.deliveryDate && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_STYLE[b.tone]}`}>{b.label}</span>
                )}
              </div>

              {row.productText && (
                <p className="line-clamp-3 whitespace-pre-line break-words text-[15px] leading-snug" title={row.productText}>
                  {row.productText}
                </p>
              )}

              {row.notes && (
                <p className="rounded-[var(--radius-sm)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink-2)]">
                  {row.notes}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                {phoneCell(row, true)}
                <span className="text-[color:var(--color-ink-3)]">Sales: {row.salesperson}</span>
              </div>

              {buttons(row, true)}
            </li>
          );
        })}
      </ul>

      {/* Table (≥ 1024 px) */}
      <div className="surface-card hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <th className="px-2.5 py-2.5">S.No · Ordered</th>
              <th className="px-2.5 py-2.5">Delivery date</th>
              <th className="px-2.5 py-2.5">Customer · Phone</th>
              <th className="px-2.5 py-2.5">Products</th>
              <th className="px-2.5 py-2.5">Salesperson</th>
              <th className="px-2.5 py-2.5">Comments</th>
              {actions.length > 0 && <th className="px-2.5 py-2.5"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[color:var(--color-border)] last:border-b-0 hover:bg-[color:var(--color-surface-2)]">
                <td className={`${TD} whitespace-nowrap tabular-nums`}>
                  <div className="font-semibold">{sno(row) ?? "—"}</div>
                  <div className="text-xs text-[color:var(--color-ink-3)]">{fmtDate(row.orderDate)}</div>
                </td>
                <td className={`${TD} min-w-[110px] max-w-[160px]`}>{deliveryCell(row)}</td>
                <td className={`${TD} min-w-[140px] max-w-[220px]`}>
                  <div className="break-words">{customerCell(row)}</div>
                  <div className="mt-1 text-[13px]">{phoneCell(row, false)}</div>
                </td>
                <td className={`${TD} min-w-[170px] max-w-[300px]`}>
                  <span className="line-clamp-3 break-words" title={row.productText ?? undefined}>
                    {row.productText ?? "—"}
                  </span>
                </td>
                <td className={`${TD} whitespace-nowrap`}>{row.salesperson}</td>
                <td className={`${TD} min-w-[130px] max-w-[220px] text-[color:var(--color-ink-2)]`}>
                  <span className="line-clamp-3 break-words" title={row.notes ?? undefined}>
                    {row.notes ?? "—"}
                  </span>
                </td>
                {actions.length > 0 && <td className={`${TD} w-[150px] min-w-[150px]`}>{buttons(row, false)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
