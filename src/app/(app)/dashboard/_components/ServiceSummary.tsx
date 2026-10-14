// Spec §6 — service requests summary (pending, done this month, free vs paid).
import Link from "next/link";
import { Wrench } from "lucide-react";
import type { OpsOverview } from "@/server/services/opsOverviewService";

export function ServiceSummary({ s, monthLabel }: { s: OpsOverview["service"]; monthLabel: string }) {
  const raised = s.free + s.paid;
  const freePct = raised > 0 ? Math.round((s.free / raised) * 100) : 0;
  return (
    <section className="surface-card min-w-0 p-4 sm:p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="label-caps flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[color:var(--color-accent)]" aria-hidden />
          Service requests
        </h2>
        <Link href="/service" className="text-xs font-medium text-[color:var(--color-accent)] hover:underline">
          Open service ›
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Pending" value={s.pending} tone={s.pending > 0 ? "text-[color:var(--color-warn)]" : ""} href="/service" />
        <Stat label={`Done in ${monthLabel}`} value={s.doneThisMonth} tone="text-[color:var(--color-ok)]" />
        <Stat label={`Free · raised in ${monthLabel}`} value={s.free} />
        <Stat label={`Paid · raised in ${monthLabel}`} value={s.paid} />
      </div>
      {raised > 0 && (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]" aria-hidden>
            <div className="h-full bg-[color:var(--color-accent)]" style={{ width: `${freePct}%` }} />
            <div className="h-full bg-[#E0A526]" style={{ width: `${100 - freePct}%` }} />
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
            {freePct}% free · {100 - freePct}% paid of {raised} raised in {monthLabel}
          </p>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, tone = "", href }: { label: string; value: number; tone?: string; href?: string }) {
  const body = (
    <>
      <div className="truncate text-xs text-[color:var(--color-ink-3)]">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </>
  );
  const cls = "rounded-[var(--radius)] border border-[color:var(--color-border)] px-3 py-2";
  return href ? (
    <Link href={href} className={`${cls} block hover:bg-[color:var(--color-surface-2)]`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
