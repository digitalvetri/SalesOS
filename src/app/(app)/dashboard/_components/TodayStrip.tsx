// Thin "TODAY" strip at the top of the Admin Overview — mirrors the mockup.
import { Money } from "@/components/app/Money";
import type { TodayStrip as T } from "@/server/services/adminOverviewService";

export function TodayStrip({ today }: { today: T }) {
  const empty = today.orders === 0 && today.lastOrderAgo === null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-3 text-sm">
      <span className="label-caps">Today</span>
      {empty ? (
        <span className="text-[color:var(--color-ink-3)]">
          No orders yet today.
        </span>
      ) : (
        <>
          <span className="font-semibold tabular-nums">
            {today.orders} {today.orders === 1 ? "order" : "orders"}
          </span>
          <span className="tabular-nums">
            <Money value={today.booked} className="text-sm" /> booked
          </span>
          <span className="tabular-nums">
            <Money value={today.received} className="text-sm" /> received
          </span>
          {today.lastOrderAgo && (
            <span className="text-[color:var(--color-ink-3)]">
              last order {today.lastOrderAgo}
              {today.lastOrderBy ? ` · ${today.lastOrderBy}` : ""}
            </span>
          )}
        </>
      )}
    </div>
  );
}
