// v1.1 §5.2 + I1 mockup — target bars with a pace marker ("where they should
// be today") and a last-order chip per employee. Rows coloured amber when
// behind pace, green when ≥ 100 %, ink otherwise.
import Link from "next/link";
import { formatInr } from "@/lib/formatInr";
import type { EmployeeTargetRow } from "@/server/services/adminOverviewService";

function toneClasses(pct: number | null, pace: number) {
  if (pct === null)
    return {
      fill: "bg-[color:var(--color-ink-3)]",
      label: "text-[color:var(--color-ink-3)]",
    };
  if (pct >= 100)
    return {
      fill: "bg-[color:var(--color-ok)]",
      label: "text-[color:var(--color-ok)]",
    };
  const behind = pct < pace * 0.85;
  if (behind)
    return {
      fill: "bg-[color:var(--color-warn)]",
      label: "text-[color:var(--color-warn)]",
    };
  return {
    fill: "bg-[color:var(--color-ink)]",
    label: "text-[color:var(--color-ink)]",
  };
}

export function TargetProgressBars({
  monthLabel,
  rows,
  pace,
}: {
  monthLabel: string;
  rows: EmployeeTargetRow[];
  pace: number;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="label-caps">Target progress · {monthLabel}</h2>
        <div className="flex items-center gap-3 text-[11px] text-[color:var(--color-ink-3)]">
          <span>Where they should be today ({pace}%)</span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-ink)]" />
            On pace
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[color:var(--color-warn)]" />
            Behind pace
          </span>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-3)]">
          No active sales employees. Add one from Employees ›
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const { fill, label } = toneClasses(r.pct, pace);
            const width = r.pct === null ? 0 : Math.min(100, r.pct);
            return (
              <li
                key={r.userId}
                className="grid grid-cols-[150px_1fr_140px_60px_140px] items-center gap-3"
              >
                <Link
                  href={`/employees/${r.userId}`}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {r.name}
                </Link>
                <div className="relative h-2 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${fill} transition-all`}
                    style={{ width: `${width}%` }}
                  />
                  <div
                    className="absolute inset-y-[-4px] w-px bg-[color:var(--color-ink-2)]/80"
                    style={{ left: `${Math.min(100, pace)}%` }}
                    title={`Pace marker: ${pace}%`}
                  />
                </div>
                <div className="text-right text-xs tabular-nums text-[color:var(--color-ink-2)]">
                  {formatInr(r.achieved)}{" "}
                  <span className="text-[color:var(--color-ink-3)]">
                    / {formatInr(r.target)}
                  </span>
                </div>
                <div className={`text-right text-sm font-semibold tabular-nums ${label}`}>
                  {r.pct === null ? "—" : `${r.pct}%`}
                </div>
                <div className="truncate text-right text-[11px] text-[color:var(--color-ink-3)]">
                  {r.lastOrderAgo ?? "no orders yet"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
