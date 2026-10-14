// Spec §6 — production pipeline: live counts that open the matching tab of the
// production board. Server component.
import Link from "next/link";
import { Factory, Hammer, PackageCheck, Truck } from "lucide-react";
import type { OpsOverview } from "@/server/services/opsOverviewService";

export function PipelineStrip({ p, monthLabel }: { p: OpsOverview["pipeline"]; monthLabel: string }) {
  const tiles = [
    { key: "todo", label: "Not started", value: p.notStarted, hint: "pending orders", Icon: Factory, tone: "text-[color:var(--color-ink-2)]" },
    { key: "progress", label: "On progress", value: p.inProgress, hint: "being built", Icon: Hammer, tone: "text-[#8A5A00]" },
    { key: "finished", label: "Finished", value: p.finishedAwaitingDelivery, hint: "awaiting delivery", Icon: PackageCheck, tone: "text-[color:var(--color-accent)]" },
    { key: "delivered", label: "Delivered", value: p.deliveredThisMonth, hint: `in ${monthLabel}`, Icon: Truck, tone: "text-[color:var(--color-ink)]" },
  ] as const;
  return (
    <section aria-label="Production pipeline">
      <h2 className="label-caps mb-2">Production pipeline</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.key}
            href={t.key === "todo" ? "/production" : `/production?tab=${t.key}`}
            className="surface-card group flex items-center gap-3 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--color-surface-2)]">
              <t.Icon className={`h-5 w-5 ${t.tone}`} aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-[color:var(--color-ink-3)]">{t.label}</div>
              <div className={`text-2xl font-bold tabular-nums leading-tight ${t.tone}`}>{t.value.toLocaleString("en-IN")}</div>
              <div className="truncate text-[11px] text-[color:var(--color-ink-3)]">{t.hint}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
