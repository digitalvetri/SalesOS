// Spec §6 — "Delivery follow-up — priority": pending orders grouped by their
// promised delivery date (Overdue · Today · Next 7 days · Later · No date),
// each row showing the production status. Server component.
import Link from "next/link";
import { AlertTriangle, CalendarClock, ChevronRight, Truck } from "lucide-react";
import { ProductionBadge } from "@/components/app/ProductionBadge";
import { formatOrderDate } from "@/server/domain/dashboard/overview";
import {
  FOLLOW_UP_GROUPS,
  followUpBadge,
  followUpCount,
  type FollowUpGroups,
  type FollowUpItem,
} from "@/server/domain/dashboard/followUp";

type GroupKey = keyof FollowUpGroups;

const BADGE: Record<GroupKey, string> = {
  overdue: "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
  today: "bg-[#FFF4DB] text-[#8A5A00]",
  week: "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
  later: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]",
  noDate: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
};
const HEAD: Record<GroupKey, string> = {
  overdue: "text-[color:var(--color-warn)]",
  today: "text-[#8A5A00]",
  week: "text-[color:var(--color-ok)]",
  later: "text-[color:var(--color-ink-2)]",
  noDate: "text-[color:var(--color-ink-3)]",
};

export function FollowUpList({
  groups,
  todayYmd,
  title = "Delivery follow-up — priority",
  showSalesperson = true,
  allHref,
  max = 8,
}: {
  groups: FollowUpGroups;
  todayYmd: string;
  title?: string;
  showSalesperson?: boolean;
  /** "Show all" target (the production board for admins, the pending orders list for sales). */
  allHref: string;
  max?: number;
}) {
  const total = followUpCount(groups);
  const visible = FOLLOW_UP_GROUPS.filter((g) => groups[g.key].length > 0);

  return (
    <section className="surface-card min-w-0 overflow-hidden" aria-labelledby="follow-up-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Truck className="h-4 w-4 shrink-0 text-[color:var(--color-accent)]" aria-hidden />
          <h2 id="follow-up-title" className="label-caps">{title}</h2>
          <span className="whitespace-nowrap text-xs text-[color:var(--color-ink-3)]">· {total} pending</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FOLLOW_UP_GROUPS.map((g) => (
            <span
              key={g.key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${BADGE[g.key]}`}
            >
              {g.label} {groups[g.key].length}
            </span>
          ))}
        </div>
      </header>

      {total === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
          Nothing waiting for delivery. All caught up.
        </p>
      ) : (
        <div>
          {groups.overdue.length === 0 && groups.today.length === 0 && groups.week.length === 0 && (
            <p className="flex items-center gap-2 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-2 text-xs text-[color:var(--color-ink-2)] sm:px-5">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              No deliveries due this week. Add a delivery date on an order to plan it here.
            </p>
          )}
          {visible.map((g) => {
            const items = groups[g.key];
            return (
              <div key={g.key} className="border-t border-[color:var(--color-border)] first:border-t-0">
                <h3 className={`flex items-center gap-1.5 bg-[color:var(--color-surface-2)]/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide sm:px-5 ${HEAD[g.key]}`}>
                  {g.key === "overdue" && <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                  {g.label}
                  <span className="font-normal normal-case tracking-normal text-[color:var(--color-ink-3)]">· {items.length}</span>
                </h3>
                <ul>
                  {items.slice(0, max).map((it) => (
                    <Row key={it.id} it={it} group={g.key} todayYmd={todayYmd} showSalesperson={showSalesperson} />
                  ))}
                </ul>
                {items.length > max && (
                  <Link
                    href={allHref}
                    className="block border-t border-[color:var(--color-border)] px-4 py-2 text-xs font-medium text-[color:var(--color-accent)] hover:underline sm:px-5"
                  >
                    Show all {items.length} ›
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Row({ it, group, todayYmd, showSalesperson }: { it: FollowUpItem; group: GroupKey; todayYmd: string; showSalesperson: boolean }) {
  return (
    <li className="border-t border-[color:var(--color-border)] first:border-t-0">
      <Link
        href={`/orders/${it.id}`}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[color:var(--color-surface-2)]/60 sm:px-5"
      >
        <div className="w-[76px] shrink-0">
          <div className="text-sm font-medium tabular-nums">
            {it.deliveryDate ? formatOrderDate(it.deliveryDate, todayYmd) : "—"}
          </div>
          <span className={`mt-0.5 inline-block whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold ${BADGE[group]}`}>
            {followUpBadge(it.deliveryDate, todayYmd)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{it.customer}</div>
          <div className="truncate text-xs text-[color:var(--color-ink-3)]">
            {showSalesperson && <span className="font-medium text-[color:var(--color-ink-2)] sm:hidden">{it.salesperson} · </span>}
            {it.productText || "No products noted"}
          </div>
        </div>
        {showSalesperson && (
          <div className="hidden w-28 shrink-0 truncate text-xs text-[color:var(--color-ink-2)] sm:block">{it.salesperson}</div>
        )}
        <ProductionBadge status={it.productionStatus} className="shrink-0" />
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-[color:var(--color-ink-3)] sm:block" aria-hidden />
      </Link>
    </li>
  );
}
