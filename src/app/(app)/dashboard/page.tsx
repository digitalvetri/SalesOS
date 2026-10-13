// v1.1 §5.2 — Admin Overview (responsive layout).
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Hourglass,
  IndianRupee,
  PackageCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { adminOverview } from "@/server/services/adminOverviewService";
import { Money } from "@/components/app/Money";
import { formatInr } from "@/lib/formatInr";
import { TodayStrip } from "./_components/TodayStrip";
import { TargetProgressBars } from "./_components/TargetProgressBars";
import { LatestOrdersLive } from "./_components/LatestOrdersLive";
import { BiggestBalances } from "./_components/BiggestBalances";
import { Mini3D } from "@/components/app/three/Mini3D";
import type { Mini3DKind } from "@/components/app/three/mini3dEngine";

function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return prev.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

function DeltaChip({ pct, prevLabel, onAccent }: { pct: number | null; prevLabel: string; onAccent?: boolean }) {
  if (pct === null)
    return (
      <span className={onAccent ? "text-white/75" : "text-[color:var(--color-ink-3)]"}>
        no {prevLabel} figures to compare
      </span>
    );
  const up = pct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const tone = onAccent
    ? "bg-white/20 text-white"
    : up
      ? "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]"
      : "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]";
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
        <Icon className="h-3 w-3" aria-hidden />
        {Math.abs(pct)}%
      </span>
      <span className={onAccent ? "text-white/75" : "text-[color:var(--color-ink-3)]"}>
        vs {prevLabel} (same day)
      </span>
    </span>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  if (!can(session.role, "admin.dashboard")) redirect("/home");

  const o = await adminOverview({ tenantId: session.tenantId });
  const prevLabel = monthShort(o.monthYm);
  const roleLabel = session.role === "OWNER" ? "Owner" : session.role === "ACCOUNTS" ? "Accounts" : "Admin";

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:gap-5 md:px-6 md:py-7 xl:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-gold)]">
            {roleLabel} · Overview
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">{o.monthLabel} at a glance</h1>
          <p className="mt-1.5 text-sm text-[color:var(--color-ink-3)]">
            Track your orders, payments and team performance — all in one place.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Mini3D
            kind="growth"
            className="hidden h-28 w-44 lg:block"
            fallback={<BarChart3 className="h-10 w-10 text-[color:var(--color-gold)]" />}
          />
          <Link
            href="/orders"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 text-sm font-semibold text-[color:var(--color-ink)] shadow-[var(--shadow-1)] transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            All orders
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <TodayStrip today={o.today} />

      {/* KPI tiles — Payment received is the one accent element on this screen. */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <Link
          href={`/orders?m=${o.monthYm}`}
          data-gold
          className="kpi-hero relative overflow-hidden rounded-[var(--radius-lg)] p-5 sm:col-span-2 sm:p-6 lg:col-span-1"
        >
          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.1em] text-white/90">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <Wallet className="h-4 w-4" aria-hidden />
              </span>
              Payment received
            </div>
          </div>
          <div className="relative mt-4 pr-24 text-3xl font-bold tracking-tight tabular-nums sm:pr-28 sm:text-[2.6rem] sm:leading-none">
            <Money value={o.paymentReceived.value} className="text-3xl sm:text-[2.6rem]" />
          </div>
          <div className="relative mt-3 pr-24 text-xs text-white/85 sm:pr-28">
            in {o.monthLabel} · <DeltaChip pct={o.paymentReceived.vsPrevPct} prevLabel={prevLabel} onAccent />
          </div>
          <Mini3D
            kind="coin"
            className="pointer-events-none absolute right-2 top-1/2 h-24 w-24 -translate-y-1/2 sm:h-32 sm:w-32"
            fallback={<IndianRupee className="h-10 w-10 text-white/70" />}
          />
        </Link>

        <KpiTile
          href={`/orders?m=${o.monthYm}&f=completed`}
          label="Orders completed"
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
          art={<PackageCheck className="h-full w-full" aria-hidden />}
          art3d="parcel"
          tone="ok"
          value={<span className="tabular-nums">{o.ordersCompleted.count}</span>}
          hint={
            <>
              <span className="tabular-nums text-[color:var(--color-ink-2)]">
                <Money value={o.ordersCompleted.value} className="text-xs font-semibold" /> value
              </span>
              <span className="mt-1.5 block">
                <DeltaChip pct={o.ordersCompleted.vsPrevPct} prevLabel={prevLabel} />
              </span>
            </>
          }
        />

        <KpiTile
          href="/orders?f=pending"
          label="Pending orders"
          icon={<Clock3 className="h-4 w-4" aria-hidden />}
          art={<Hourglass className="h-full w-full" aria-hidden />}
          art3d="hourglass"
          tone="warn"
          value={<span className="tabular-nums">{o.pendingOrders.count}</span>}
          hint={
            <>
              <span className="tabular-nums text-[color:var(--color-ink-2)]">
                <span className="font-semibold">{formatInr(o.pendingOrders.value)}</span> still to collect
              </span>
              <span className="block text-[color:var(--color-ink-3)]">
                across {o.pendingOrders.collectCount} {o.pendingOrders.collectCount === 1 ? "order" : "orders"} with a balance
              </span>
              {o.pendingOrders.extraHint && (
                <span className="mt-1.5 block font-semibold text-[color:var(--color-warn)]">
                  {o.pendingOrders.extraHint}
                </span>
              )}
            </>
          }
        />
      </section>

      <TargetProgressBars
        monthLabel={o.monthLabel}
        rows={o.employees}
        team={o.team}
        pace={o.paceToday}
        canSetTargets={can(session.role, "targets.set")}
      />

      <div className="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-2">
        <BiggestBalances rows={o.biggestBalances} />
        <LatestOrdersLive initial={o.latestOrders} />
      </div>
    </div>
  );
}

const TONE = {
  ok: {
    tile: "bg-[color:var(--color-ok-bg)] border-[color:var(--color-ok)]/15",
    icon: "bg-[color:var(--color-ok)] text-white",
    label: "text-[color:var(--color-ok)]",
    art: "text-[color:var(--color-ok)]",
  },
  warn: {
    tile: "bg-[color:var(--color-warn-bg)] border-[color:var(--color-warn)]/15",
    icon: "bg-[color:var(--color-warn)] text-white",
    label: "text-[color:var(--color-warn)]",
    art: "text-[color:var(--color-warn)]",
  },
} as const;

function KpiTile({
  href,
  label,
  icon,
  art,
  art3d,
  tone,
  value,
  hint,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  art: React.ReactNode;
  art3d: Mini3DKind;
  tone: keyof typeof TONE;
  value: React.ReactNode;
  hint: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <Link
      href={href}
      className={`relative block overflow-hidden rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-1)] transition-transform hover:-translate-y-0.5 sm:p-6 ${t.tile}`}
    >
      <Mini3D
        kind={art3d}
        className="pointer-events-none absolute right-1 top-1/2 h-28 w-28 -translate-y-1/2 sm:h-32 sm:w-32"
        fallback={<span className={`h-20 w-20 opacity-15 ${t.art}`}>{art}</span>}
      />
      <div className={`relative flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.1em] ${t.label}`}>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${t.icon}`}>{icon}</span>
        {label}
      </div>
      <div className="relative mt-4 text-4xl font-bold tracking-tight sm:text-[2.6rem] sm:leading-none">{value}</div>
      <div className="relative mt-3 text-xs text-[color:var(--color-ink-3)]">{hint}</div>
    </Link>
  );
}
