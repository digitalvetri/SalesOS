// I1 mockup — "Biggest balances to collect" panel. Each row has a Remind
// button that opens WhatsApp with a prefilled payment-reminder message
// (wa.me deep link, no API).
"use client";
import Link from "next/link";
import { Money } from "@/components/app/Money";
import { Bell } from "lucide-react";
import type { BalanceRow } from "@/server/services/adminOverviewService";

function waHref(phoneE164: string, customerName: string, amount: string, days: number) {
  const digits = phoneE164.replace(/^\+/, "");
  const msg =
    `Hi ${customerName}, this is a friendly reminder that ₹${Number(amount).toLocaleString("en-IN")} is pending on your order` +
    (days > 0 ? ` for ${days} day${days === 1 ? "" : "s"}.` : ".") +
    ` Please let us know when you'd like to settle it. Thanks!`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}

export function BiggestBalances({ rows }: { rows: BalanceRow[] }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-[var(--shadow-1)]">
      <header className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
        <h2 className="label-caps">Biggest balances to collect</h2>
        <Link
          href="/orders?f=balance_due"
          className="text-xs text-[color:var(--color-ink-2)] hover:underline"
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
              className="flex items-center justify-between gap-4 border-t border-[color:var(--color-border)] px-5 py-3 first:border-t-0"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium">{r.customerName}</div>
                <div className="text-xs text-[color:var(--color-ink-3)]">
                  {r.salespersonName} · pending {r.pendingDays}{" "}
                  {r.pendingDays === 1 ? "day" : "days"}
                </div>
              </div>
              <div className="text-right">
                <Money value={r.balance} className="font-semibold" />
              </div>
              <a
                href={waHref(r.customerPhoneE164, r.customerName, r.balance, r.pendingDays)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--color-border-strong)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
              >
                <Bell className="h-3 w-3" />
                Remind
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
