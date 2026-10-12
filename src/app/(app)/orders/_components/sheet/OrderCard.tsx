"use client";
// Phone/tablet (< 1024 px) view of one order. Same actions as the table row:
// tap Paid → Add payment, status select → complete / reopen / cancel.
import * as React from "react";
import Decimal from "decimal.js";
import { Phone, Plus } from "lucide-react";
import { Money } from "@/components/app/Money";
import type { OrderV2Row } from "@/server/repo/ordersV2";
import { AddPaymentPopover } from "./AddPaymentPopover";
import { useOrderStatus } from "./useOrderForms";
import { fmtDate, PILL_STYLE, initialsOf } from "./sheetFormat";

export function OrderCard({ row, mode }: { row: OrderV2Row; mode: "employee" | "admin" }) {
  const [showPay, setShowPay] = React.useState(false);
  const { pending, updateStatus } = useOrderStatus(row);
  const paidUp = new Decimal(row.balanceDue).isZero();
  const cancelled = row.simpleStatus === "CANCELLED";
  const phone = row.customerPhoneE164.replace(/^\+91/, "");

  return (
    <li className={`surface-card min-w-0 p-4 ${cancelled ? "opacity-70" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-[color:var(--color-ink-3)]">
          <span className="whitespace-nowrap rounded-md bg-[color:var(--color-surface-2)] px-1.5 py-0.5 font-semibold tabular-nums text-[color:var(--color-ink-2)]">
            #{row.serialNo === null ? "—" : mode === "admin" ? `${initialsOf(row.salespersonName)}-${row.serialNo}` : row.serialNo}
          </span>
          <span className="whitespace-nowrap tabular-nums">{fmtDate(row.orderDate)}</span>
          {mode === "admin" && <span className="truncate font-medium text-[color:var(--color-gold)]">{row.salespersonName}</span>}
        </div>
        <select
          aria-label={`Status of order for ${row.customerName}`}
          value={row.simpleStatus}
          onChange={(e) => void updateStatus(e.target.value as "PENDING" | "COMPLETED" | "CANCELLED")}
          disabled={pending || (mode === "employee" && row.simpleStatus !== "PENDING")}
          title={mode === "employee" && row.simpleStatus !== "PENDING" ? "Only an admin can change this order" : undefined}
          className={`h-8 shrink-0 rounded-full border-0 px-2.5 text-xs font-semibold ${PILL_STYLE[row.simpleStatus]}`}
        >
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="mt-2.5 min-w-0">
        <div className="truncate text-base font-semibold">{row.customerName}</div>
        <p className="mt-0.5 line-clamp-2 text-sm text-[color:var(--color-ink-2)]">{row.productText ?? "—"}</p>
        <a
          href={`tel:${row.customerPhoneE164}`}
          className="mt-1.5 inline-flex items-center gap-1.5 text-xs tabular-nums text-[color:var(--color-ink-3)] hover:text-[color:var(--color-gold)]"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
          {phone}
        </a>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-[var(--radius)] bg-[color:var(--color-surface-2)]/70 p-2.5 text-center">
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Total</dt>
          <dd className="truncate text-sm font-semibold">
            <Money value={row.total} className="text-sm" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Paid</dt>
          <dd className="truncate text-sm font-semibold">
            <Money value={row.paidTotal} className="text-sm" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">Balance</dt>
          <dd className="truncate text-sm font-semibold">
            {paidUp ? (
              <span className="text-[color:var(--color-ok)]">Paid</span>
            ) : (
              <Money value={row.balanceDue} className="text-sm text-[color:var(--color-warn)]" />
            )}
          </dd>
        </div>
      </dl>

      {!cancelled && !paidUp && (
        <button
          type="button"
          onClick={() => setShowPay(true)}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] text-sm font-medium transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add payment
        </button>
      )}

      {showPay && (
        <AddPaymentPopover orderId={row.id} currentBalance={row.balanceDue} onClose={() => setShowPay(false)} />
      )}
    </li>
  );
}
