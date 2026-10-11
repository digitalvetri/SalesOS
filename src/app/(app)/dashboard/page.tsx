// v1.1 §5.2 + I1 mockup — Admin Overview.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { adminOverview } from "@/server/services/adminOverviewService";
import { Money } from "@/components/app/Money";
import { formatInr } from "@/lib/formatInr";
import { TodayStrip } from "./_components/TodayStrip";
import { TargetProgressBars } from "./_components/TargetProgressBars";
import { LatestOrdersLive } from "./_components/LatestOrdersLive";
import { BiggestBalances } from "./_components/BiggestBalances";

function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return prev.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
}

function deltaChip(pct: number | null, prevLabel: string) {
  if (pct === null)
    return (
      <span className="text-[color:var(--color-ink-3)]">no comparison</span>
    );
  const up = pct >= 0;
  const sign = up ? "▲" : "▼";
  return (
    <span className={up ? "text-[color:var(--color-ok)]" : "text-[color:var(--color-warn)]"}>
      {sign} {Math.abs(pct)}% vs {prevLabel} (same day)
    </span>
  );
}

export default async function DashboardPage() {
  const session = await requireSession();
  if (!can(session.role, "admin.dashboard")) redirect("/home");

  const o = await adminOverview({ tenantId: session.tenantId });
  const prevLabel = monthShort(o.monthYm);

  return (
    <div className="flex flex-col gap-5 px-4 py-6 md:px-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[color:var(--color-ink-3)]">Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {o.monthLabel} overview
          </h1>
        </div>
      </header>

      <TodayStrip today={o.today} />

      {/* Three tiles — Payment received is the one gold accent on this screen. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Tile
          href={`/orders?m=${o.monthYm}&f=completed`}
          label="Orders completed"
          primary={<span className="tabular-nums">{o.ordersCompleted.count}</span>}
          hint={
            <>
              <Money value={o.ordersCompleted.value} className="text-xs" /> value
              <br />
              {deltaChip(o.ordersCompleted.vsPrevPct, prevLabel)}
            </>
          }
        />
        <Tile
          href={`/orders?m=${o.monthYm}`}
          label="Payment received"
          hero
          primary={
            <span
              data-gold
              className="inline-block rounded-[var(--radius)] px-2 py-0.5 tabular-nums"
            >
              <Money value={o.paymentReceived.value} />
            </span>
          }
          hint={
            <>
              in {o.monthLabel}
              <br />
              {deltaChip(o.paymentReceived.vsPrevPct, prevLabel)}
            </>
          }
        />
        <Tile
          href="/orders?f=pending"
          label="Pending orders"
          primary={<span className="tabular-nums">{o.pendingOrders.count}</span>}
          hint={
            <>
              {formatInr(o.pendingOrders.value)} still to collect
              {o.pendingOrders.extraHint && (
                <>
                  <br />
                  <span className="text-[color:var(--color-warn)]">
                    {o.pendingOrders.extraHint}
                  </span>
                </>
              )}
            </>
          }
        />
      </section>

      <TargetProgressBars monthLabel={o.monthLabel} rows={o.employees} pace={o.paceToday} />

      <div className="grid gap-5 lg:grid-cols-2">
        <BiggestBalances rows={o.biggestBalances} />
        <LatestOrdersLive initial={o.latestOrders} />
      </div>
    </div>
  );
}

function Tile({
  href,
  label,
  primary,
  hint,
  hero,
}: {
  href: string;
  label: string;
  primary: React.ReactNode;
  hint: React.ReactNode;
  hero?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-1)] hover:bg-[color:var(--color-surface-2)] ${
        hero
          ? "border-[color:var(--color-gold)]/40 bg-[color:var(--color-gold-soft)]"
          : "border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
      }`}
    >
      <div className="label-caps">{label}</div>
      <div className="mt-1 text-3xl font-bold tracking-tight">{primary}</div>
      <div className="mt-1 text-xs text-[color:var(--color-ink-3)]">{hint}</div>
    </Link>
  );
}
