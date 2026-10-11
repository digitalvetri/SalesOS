"use client";
// v1.1 §5.2 "Latest orders (live)" — client polling at 30s intervals so new
// orders appear without a page refresh. New rows get a 3-second highlight.
// Shows a "Live" dot that goes grey if the last poll failed.
import * as React from "react";
import Link from "next/link";
import { Money } from "@/components/app/Money";
import { formatInr } from "@/lib/formatInr";
import Decimal from "decimal.js";
import type { LatestOrderRow } from "@/server/services/adminOverviewService";

const STATUS_PILL: Record<LatestOrderRow["simpleStatus"], string> = {
  PENDING: "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
  COMPLETED: "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
  CANCELLED: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
};

const POLL_MS = 30_000;
const HIGHLIGHT_MS = 3_000;

function fmtTime(iso: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(iso);
}

export function LatestOrdersLive({ initial }: { initial: LatestOrderRow[] }) {
  const [rows, setRows] = React.useState<LatestOrderRow[]>(initial);
  const [live, setLive] = React.useState(true);
  const [newIds, setNewIds] = React.useState<Set<string>>(new Set());
  const seenIds = React.useRef<Set<string>>(new Set(initial.map((r) => r.id)));

  React.useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/overview/latest-orders", {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          ok: boolean;
          data?: { latestOrders: LatestOrderRow[] };
        };
        if (cancelled || !body.ok || !body.data) return;
        setLive(true);
        const next = body.data.latestOrders.map((r) => ({
          ...r,
          // Dates arrive as strings over JSON — rebuild Date objects.
          orderDate: new Date(r.orderDate),
          createdAt: new Date(r.createdAt),
        }));
        setRows(next);
        const incomingNew = next
          .map((r) => r.id)
          .filter((id) => !seenIds.current.has(id));
        if (incomingNew.length > 0) {
          const freshSet = new Set(incomingNew);
          setNewIds(freshSet);
          incomingNew.forEach((id) => seenIds.current.add(id));
          window.setTimeout(() => {
            if (cancelled) return;
            setNewIds(new Set());
          }, HIGHLIGHT_MS);
        }
      } catch {
        if (!cancelled) setLive(false);
      }
    }
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-[var(--shadow-1)]">
      <header className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
        <div className="flex items-center gap-2">
          <h2 className="label-caps">Latest orders</h2>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              live
                ? "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]"
                : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]"
            }`}
            title={live ? "Updates every 30s" : "Reconnecting…"}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                live ? "bg-[color:var(--color-ok)]" : "bg-[color:var(--color-ink-3)]"
              }`}
            />
            {live ? "Live" : "Offline"}
          </span>
        </div>
        <Link
          href="/orders"
          className="text-xs text-[color:var(--color-ink-2)] hover:underline"
        >
          See all orders ›
        </Link>
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
          No orders yet.
        </p>
      ) : (
        <ul>
          {rows.map((r) => {
            const bal = new Decimal(r.balanceDue);
            const fresh = newIds.has(r.id);
            return (
              <li
                key={r.id}
                className={`border-t border-[color:var(--color-border)] first:border-t-0 transition-colors ${
                  fresh ? "bg-[color:var(--color-gold-soft)]/60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs tabular-nums text-[color:var(--color-ink-3)]">
                        {fmtTime(r.createdAt)}
                      </span>
                      <span className="text-xs font-medium text-[color:var(--color-gold)]">
                        {r.salespersonName}
                      </span>
                      <span className="font-medium">{r.customerName}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[r.simpleStatus]}`}
                      >
                        {r.simpleStatus.toLowerCase()}
                      </span>
                    </div>
                    {r.productText && (
                      <div className="mt-0.5 truncate text-xs text-[color:var(--color-ink-2)]">
                        {r.productText}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <Money value={r.total} />
                    <div className="text-[11px] text-[color:var(--color-ink-3)]">
                      {bal.isZero() ? "paid" : <>Bal {formatInr(bal.toString())}</>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
