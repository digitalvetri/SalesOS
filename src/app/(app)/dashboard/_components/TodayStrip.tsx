// "TODAY" strip at the top of the Admin Overview. 2×2 mini-stats on phones,
// a single row from 768 px.
import { CalendarCheck, Clock3, IndianRupee, Wallet } from "lucide-react";
import { Money } from "@/components/app/Money";
import type { TodayStrip as T } from "@/server/services/adminOverviewService";

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 md:px-5 md:first:pl-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-gold-soft)] text-[color:var(--color-gold)] sm:h-12 sm:w-12">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">{label}</div>
        <div className="truncate text-sm font-bold tabular-nums sm:text-base">{children}</div>
      </div>
    </div>
  );
}

export function TodayStrip({ today }: { today: T }) {
  const empty = today.orders === 0 && today.lastOrderAgo === null;
  return (
    <section aria-label="Today" className="surface-card px-4 py-4 sm:px-6 sm:py-5">
      {empty ? (
        <p className="text-sm text-[color:var(--color-ink-3)]">
          <span className="label-caps mr-3">Today</span>No orders yet today.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-4 md:gap-0 md:divide-x md:divide-[color:var(--color-border)]">
          <Stat icon={<CalendarCheck className="h-5 w-5" aria-hidden />} label="Orders today">
            {today.orders} {today.orders === 1 ? "order" : "orders"}
          </Stat>
          <Stat icon={<IndianRupee className="h-5 w-5" aria-hidden />} label="Booked">
            <Money value={today.booked} className="text-sm sm:text-base" />
          </Stat>
          <Stat icon={<Wallet className="h-5 w-5" aria-hidden />} label="Received">
            <Money value={today.received} className="text-sm sm:text-base" />
          </Stat>
          <Stat icon={<Clock3 className="h-5 w-5" aria-hidden />} label="Last order">
            {today.lastOrderAgo ?? "—"}
            {today.lastOrderBy ? (
              <span className="font-normal text-[color:var(--color-ink-3)]"> · {today.lastOrderBy}</span>
            ) : null}
          </Stat>
        </div>
      )}
    </section>
  );
}
