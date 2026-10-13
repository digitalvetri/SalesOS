// I1 mockup — "Biggest balances to collect" panel. Each row has a Remind
// button that opens WhatsApp with a prefilled payment-reminder message
// (wa.me deep link, no API). Largest balance first across every
// non-cancelled order (pending or delivered-but-unpaid); no Remind button when
// the customer has no phone on file.
"use client";
import Link from "next/link";
import { Money } from "@/components/app/Money";
import { Bell } from "lucide-react";
import type { BalanceRow } from "@/server/services/adminOverviewService";

function waHref(phoneE164: string, customerName: string, amount: string, days: number) {
  const digits = phoneE164.replace(/^\+/, "");
  const greeting = customerName === "—" ? "Hi" : `Hi ${customerName}`;
  const msg =
    `${greeting}, this is a friendly reminder that ₹${Number(amount).toLocaleString("en-IN")} is pending on your order` +
    (days > 0 ? ` for ${days} day${days === 1 ? "" : "s"}.` : ".") +
    ` Please let us know when you'd like to settle it. Thanks!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

export function BiggestBalances({ rows }: { rows: BalanceRow[] }) {
  return (
    <section className="surface-card min-w-0 overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3.5 sm:px-5">
        <h2 className="label-caps">Biggest balances to collect</h2>
        <Link
          href="/orders?f=balance_due"
          className="shrink-0 text-xs font-medium text-[color:var(--color-gold)] hover:underline"
        >
          All balances ›
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
          Nothing pending. Clean slate.
        </p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li
              key={r.orderId}
              className="flex items-center justify-between gap-3 border-t border-[color:var(--color-border)] px-4 py-3 transition-colors first:border-t-0 hover:bg-[color:var(--color-surface-2)]/50 sm:gap-4 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.customerName}</div>
                <div className="truncate text-xs text-[color:var(--color-ink-3)]">
                  {r.salespersonName} · {r.simpleStatus === "COMPLETED" ? "delivered, " : ""}
                  {r.pendingDays} {r.pendingDays === 1 ? "day" : "days"} since order
                </div>
              </div>
              <div className="text-right">
                <Money value={r.balance} className="font-semibold tabular-nums" />
              </div>
              {r.customerPhoneE164 ? (
                <a
                  href={waHref(r.customerPhoneE164, r.customerName, r.balance, r.pendingDays)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Remind ${r.customerName} on WhatsApp`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--color-border-strong)] px-2.5 text-xs font-medium text-[color:var(--color-ink)] transition-colors hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)] sm:px-3"
                >
                  <Bell className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden sm:inline">Remind</span>
                </a>
              ) : (
                <span
                  title="No phone number on file"
                  className="inline-flex h-9 shrink-0 items-center px-2.5 text-[11px] text-[color:var(--color-ink-3)] sm:px-3"
                >
                  No phone
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
