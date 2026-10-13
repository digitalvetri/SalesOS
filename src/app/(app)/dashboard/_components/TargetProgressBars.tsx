// v1.1 §5.2 + I1 mockup — target bars with a pace marker ("where they should
// be today") and a last-order chip per employee. Rows coloured amber when
// behind pace, green when ≥ 100 %, accent otherwise. Employees with no target
// (none set, or ₹0) show their month's sales and "No target set" — no ratio,
// no pace verdict.
// Phones/tablets: name + % / bar / ₹ + last order stacked. ≥ 1024 px: one grid row.
import Link from "next/link";
import { formatInr } from "@/lib/formatInr";
import { paceVerdict, type PaceVerdict, type TeamTotals } from "@/server/domain/dashboard/overview";
import type { EmployeeTargetRow } from "@/server/services/adminOverviewService";

const TONE: Record<PaceVerdict, { fill: string; label: string }> = {
  none: { fill: "bg-[color:var(--color-ink-3)]", label: "text-[color:var(--color-ink-3)]" },
  achieved: { fill: "bg-[color:var(--color-ok)]", label: "text-[color:var(--color-ok)]" },
  behind: { fill: "bg-[color:var(--color-warn-fill)]", label: "text-[color:var(--color-warn)]" },
  on_pace: { fill: "bg-[color:var(--color-chart)]", label: "text-[color:var(--color-ink)]" },
};

function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

export function TargetProgressBars({
  monthLabel,
  rows,
  team,
  pace,
  canSetTargets,
}: {
  monthLabel: string;
  rows: EmployeeTargetRow[];
  team: TeamTotals;
  pace: number;
  canSetTargets: boolean;
}) {
  const anyTarget = team.withTarget > 0;
  const missing = rows.length - team.withTarget;
  return (
    <section className="surface-card p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-[color:var(--color-ink)]">
          {anyTarget ? "Target progress" : "Sales this month"}{" "}
          <span className="font-medium text-[color:var(--color-ink-3)]">· {monthLabel}</span>
        </h2>
        {anyTarget ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--color-ink-3)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-px bg-[color:var(--color-ink-2)]" />
              Pace today {pace}%
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-chart)]" />
              On pace
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-warn-fill)]" />
              Behind
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--color-ok)]" />
              Achieved
            </span>
          </div>
        ) : (
          rows.length > 0 && (
            <p className="text-[11px] text-[color:var(--color-ink-3)]">
              No targets set for {monthLabel}.
              {canSetTargets && (
                <>
                  {" "}
                  <Link href="/settings/targets" className="font-medium text-[color:var(--color-gold)] hover:underline">
                    Set targets ›
                  </Link>
                </>
              )}
            </p>
          )
        )}
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-3)]">
          No active sales employees. Add one from Employees ›
        </p>
      ) : (
        <>
          <ul className="divide-y divide-[color:var(--color-border)] lg:divide-y-0 lg:space-y-3">
            {rows.map((r) => {
              const verdict = paceVerdict(r.pct, pace);
              const { fill, label } = TONE[verdict];
              const width = r.pct === null ? 0 : Math.min(100, r.pct);
              return (
                <li
                  key={r.userId}
                  className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0 lg:grid-cols-[170px_minmax(0,1fr)_170px_56px_120px] lg:py-0"
                >
                  <Link
                    href={`/employees/${r.userId}`}
                    className="flex min-w-0 items-center gap-2.5 text-sm font-medium hover:underline"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-gold-soft)] text-xs font-semibold text-[color:var(--color-gold)]">
                      {initials(r.name)}
                    </span>
                    <span className="truncate">{r.name}</span>
                  </Link>
                  <div className={`text-right text-sm font-bold tabular-nums lg:order-4 ${label}`}>
                    {r.pct === null ? "" : `${r.pct}%`}
                  </div>
                  {r.hasTarget ? (
                    <div className="relative col-span-2 h-3 overflow-visible rounded-full bg-[color:var(--color-surface-2)] lg:order-2 lg:col-span-1">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${fill} transition-all duration-700`}
                        style={{ width: `${width}%` }}
                      />
                      <div
                        className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-[color:var(--color-ink-2)]"
                        style={{ left: `${Math.min(100, pace)}%` }}
                        title={`Pace marker: ${pace}%`}
                      />
                    </div>
                  ) : (
                    <div className="col-span-2 text-xs text-[color:var(--color-ink-3)] lg:order-2 lg:col-span-1">
                      No target set
                      {canSetTargets && (
                        <>
                          {" · "}
                          <Link
                            href="/settings/targets"
                            className="font-medium text-[color:var(--color-gold)] hover:underline"
                          >
                            Set target
                          </Link>
                        </>
                      )}
                    </div>
                  )}
                  <div className="text-xs tabular-nums text-[color:var(--color-ink-2)] lg:order-3 lg:text-right">
                    {formatInr(r.achieved)}{" "}
                    {r.hasTarget ? (
                      <span className="text-[color:var(--color-ink-3)]">/ {formatInr(r.target)}</span>
                    ) : (
                      <span className="text-[color:var(--color-ink-3)]">sales</span>
                    )}
                  </div>
                  <div className="truncate text-right text-[11px] text-[color:var(--color-ink-3)] lg:order-5">
                    {r.lastOrderAgo ?? "no orders yet"}
                  </div>
                </li>
              );
            })}
          </ul>
          <footer className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[color:var(--color-border)] pt-3 text-xs text-[color:var(--color-ink-3)]">
            <span>
              <span className="font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink)]">Team</span>{" "}
              · <span className="font-semibold tabular-nums text-[color:var(--color-ink)]">{formatInr(team.achieved)}</span>{" "}
              booked in {monthLabel}
            </span>
            {anyTarget && (
              <span className="tabular-nums">
                {formatInr(team.achievedOfTargeted)} / {formatInr(team.target)} target
                {team.pct !== null && <> · {team.pct}%</>}
                {missing > 0 && <> · {missing} without a target</>}
              </span>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
