// v1.1 §5.2 — Admin Overview (responsive layout).
// Pick a year or a month at the top; every tile and table below describes the
// orders booked in that period, so the numbers can be compared with each other.
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3 } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { adminOverview } from "@/server/services/adminOverviewService";
import { periodReport } from "@/server/services/periodReportService";
import {
  employeeRows,
  inPeriod,
  monthlyRows,
  parsePeriod,
  periodKey,
  periodLabel,
  previousPeriod,
  sumCells,
} from "@/server/domain/dashboard/periodReport";
import { TodayStrip } from "./_components/TodayStrip";
import { TargetProgressBars } from "./_components/TargetProgressBars";
import { LatestOrdersLive } from "./_components/LatestOrdersLive";
import { BiggestBalances } from "./_components/BiggestBalances";
import { MonthlyBreakdown, PeriodBar, PeriodKpis, TeamMonthGrid, TeamTable } from "./_components/PeriodReport";
import { Mini3D } from "@/components/app/three/Mini3D";

const istToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const session = await requireSession();
  if (!can(session.role, "admin.dashboard")) redirect("/home");

  const today = istToday();
  const sp = await searchParams;
  const period = parsePeriod(sp.p, today);
  const [o, report] = await Promise.all([
    adminOverview({ tenantId: session.tenantId }),
    periodReport({ tenantId: session.tenantId, year: period.year, todayYmd: today }),
  ]);
  const roleLabel = session.role === "OWNER" ? "Owner" : session.role === "ACCOUNTS" ? "Accounts" : "Admin";

  const label = periodLabel(period);
  const prev = previousPeriod(period);
  const totals = sumCells(inPeriod(report.cells, period));
  const prevTotals = sumCells(inPeriod(report.cells, prev));
  const prevLabel = prev.kind === "year" ? String(prev.year) : periodLabel(prev).split(" ")[0]!;
  const yearPeriod = { kind: "year" as const, year: period.year };
  const months = monthlyRows(report.cells, report.months);
  const yearTotal = sumCells(inPeriod(report.cells, yearPeriod));
  const team = employeeRows(inPeriod(report.cells, period), report.employees).filter((r) => r.orders > 0 || r.cancelled > 0 || report.employees.find((e) => e.id === r.id)?.active);
  const grid = report.employees
    .map((e) => {
      const cs = inPeriod(report.cells, yearPeriod).filter((c) => c.salespersonId === e.id);
      const byMonth = Object.fromEntries(cs.map((c) => [c.ym, { value: c.value, orders: c.orders }]));
      const t = sumCells(cs);
      return { id: e.id, name: e.name, byMonth, total: t.value, orders: t.orders, active: e.active };
    })
    .filter((r) => r.orders > 0 || r.active)
    .sort((a, b) => Number(b.total) - Number(a.total));
  const isCurrentMonth = period.kind === "month" && periodKey(period) === o.monthYm;
  const ordersHref = period.kind === "month" ? `/orders?m=${periodKey(period)}` : "/orders";

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-5 sm:gap-5 md:px-6 md:py-7 xl:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--color-gold)]">
            {roleLabel} · Overview
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">{label}</h1>
          <p className="mt-1.5 text-sm text-[color:var(--color-ink-3)]">
            Every figure below is for the orders booked in {period.kind === "year" ? `the year ${period.year}` : label} — pick another month or the whole year.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Mini3D
            kind="growth"
            className="hidden h-28 w-44 lg:block"
            fallback={<BarChart3 className="h-10 w-10 text-[color:var(--color-gold)]" />}
          />
          <Link
            href={ordersHref}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 text-sm font-semibold text-[color:var(--color-ink)] shadow-[var(--shadow-1)] transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            {period.kind === "month" ? "This month's orders" : "All orders"}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </header>

      <TodayStrip today={o.today} />

      <PeriodBar period={period} years={report.years} months={report.months} />

      <PeriodKpis period={period} t={totals} prev={prevTotals} prevLabel={prevLabel} ordersHref={ordersHref} />

      <MonthlyBreakdown year={period.year} rows={months} total={yearTotal} selected={periodKey(period)} />

      <TeamTable period={period} rows={team} total={totals} label={label} />

      <TeamMonthGrid year={period.year} months={report.months} rows={grid} selected={periodKey(period)} />

      {isCurrentMonth && (
        <TargetProgressBars
          monthLabel={o.monthLabel}
          rows={o.employees}
          team={o.team}
          pace={o.paceToday}
          canSetTargets={can(session.role, "targets.set")}
        />
      )}

      <div className="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-2">
        <BiggestBalances rows={o.biggestBalances} />
        <LatestOrdersLive initial={o.latestOrders} />
      </div>
    </div>
  );
}
