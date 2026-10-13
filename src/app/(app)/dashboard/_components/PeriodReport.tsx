// Admin Overview — period report: year / month picker, KPI tiles for the orders
// booked in the period, month-by-month breakdown, team table and team × month grid.
// Server components (links only, no client JS).
import Link from "next/link";
import { CalendarRange, CheckCircle2, Clock3, IndianRupee, PackagePlus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { formatInr } from "@/lib/formatInr";
import { compactInr } from "@/lib/compactInr";
import {
  monthShortName,
  periodKey,
  type Period,
  type PeriodTotals,
} from "@/server/domain/dashboard/periodReport";

const monthOf = (ymk: string) => Number(ymk.slice(5, 7));
const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

// ───────── Period bar ─────────

export function PeriodBar({ period, years, months }: { period: Period; years: number[]; months: string[] }) {
  const key = periodKey(period);
  const chip = (on: boolean) =>
    `inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors ${
      on
        ? "border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-white"
        : "border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
    }`;
  return (
    <nav aria-label="Period" className="surface-card flex flex-col gap-3 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">
        <CalendarRange className="h-4 w-4" aria-hidden /> Show figures for
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {years.map((y) => (
          <Link key={y} href={`/dashboard?p=${y}`} className={chip(key === String(y))} aria-current={key === String(y) ? "page" : undefined}>
            Year {y}
          </Link>
        ))}
        <span className="mx-1 w-px shrink-0 bg-[color:var(--color-border)]" aria-hidden />
        {months.map((m) => (
          <Link key={m} href={`/dashboard?p=${m}`} className={chip(key === m)} aria-current={key === m ? "page" : undefined}>
            {monthShortName(monthOf(m))}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// ───────── KPI tiles ─────────

function Change({ pct: p, label }: { pct: number | null; label: string }) {
  if (p === null) return <span className="text-[color:var(--color-ink-3)]">no {label} figures to compare</span>;
  const up = p >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          up ? "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]" : "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]"
        }`}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {Math.abs(p)}%
      </span>
      <span className="text-[color:var(--color-ink-3)]">vs {label}</span>
    </span>
  );
}

function Tile({
  href, icon, label, value, children, tone = "plain",
}: {
  href: string; icon: React.ReactNode; label: string; value: React.ReactNode; children?: React.ReactNode;
  tone?: "plain" | "ok" | "warn" | "hero";
}) {
  const box = {
    plain: "surface-card",
    ok: "rounded-[var(--radius-lg)] border border-[color:var(--color-ok)]/15 bg-[color:var(--color-ok-bg)]",
    warn: "rounded-[var(--radius-lg)] border border-[color:var(--color-warn)]/15 bg-[color:var(--color-warn-bg)]",
    hero: "kpi-hero rounded-[var(--radius-lg)]",
  }[tone];
  const labelTone = {
    plain: "text-[color:var(--color-ink-3)]",
    ok: "text-[color:var(--color-ok)]",
    warn: "text-[color:var(--color-warn)]",
    hero: "text-white/90",
  }[tone];
  return (
    <Link href={href} data-gold={tone === "hero" ? true : undefined} className={`${box} block p-4 transition-transform hover:-translate-y-0.5 sm:p-5`}>
      <div className={`flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${labelTone}`}>
        {icon}
        {label}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">{value}</div>
      {children && <div className={`mt-2 space-y-1 text-xs ${tone === "hero" ? "text-white/85" : "text-[color:var(--color-ink-2)]"}`}>{children}</div>}
    </Link>
  );
}

export function PeriodKpis({
  period, t, prev, prevLabel, ordersHref,
}: { period: Period; t: PeriodTotals; prev: PeriodTotals; prevLabel: string; ordersHref: string }) {
  const word = period.kind === "year" ? "this year" : "this month";
  const m = period.kind === "month" ? `&m=${periodKey(period)}` : "";
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-5">
      <Tile href={ordersHref} tone="hero" icon={<Wallet className="h-4 w-4" aria-hidden />} label="Money received" value={formatInr(t.received)}>
        <div>payments received {word}</div>
        <div><Change pct={changeOf(t.received, prev.received)} label={prevLabel} /></div>
      </Tile>
      <Tile href={ordersHref} icon={<PackagePlus className="h-4 w-4" aria-hidden />} label="Orders booked" value={t.orders}>
        <div className="font-semibold">{formatInr(t.value)} sales value</div>
        <div className="text-[color:var(--color-ink-3)]">
          avg {t.avgOrder ? formatInr(t.avgOrder) : "—"}{t.cancelled ? ` · ${t.cancelled} cancelled` : ""}{t.noAmount ? ` · ${t.noAmount} without amount` : ""}
        </div>
        <div><Change pct={changeOf(t.value, prev.value)} label={prevLabel} /></div>
      </Tile>
      <Tile href={`/orders?f=completed${m}`} tone="ok" icon={<CheckCircle2 className="h-4 w-4" aria-hidden />} label="Completed" value={
        <>{t.completed}<span className="ml-1.5 text-base font-semibold text-[color:var(--color-ok)]">{pct(t.completionPct)}</span></>
      }>
        <div>of the {t.orders} orders booked {word}</div>
        <div className="font-semibold">{formatInr(t.completedValue)} value</div>
      </Tile>
      <Tile href={`/orders?f=pending${m}`} tone="warn" icon={<Clock3 className="h-4 w-4" aria-hidden />} label="Pending" value={t.pending}>
        <div>{t.pendingPayment} waiting for payment</div>
        <div>{t.pendingDelivery} paid, not yet delivered</div>
        {t.noAmount > 0 && <div>{t.noAmount} without amount in the sheet</div>}
      </Tile>
      <Tile href={`/orders?f=balance_due${m}`} icon={<IndianRupee className="h-4 w-4" aria-hidden />} label="Still to collect" value={formatInr(t.balance)}>
        <div>on orders booked {word}</div>
        <div className="text-[color:var(--color-ink-3)]">{formatInr(t.paidOnOrders)} collected · {pct(t.collectedPct)} of value</div>
      </Tile>
    </section>
  );
}

function changeOf(cur: string, prev: string): number | null {
  const p = Number(prev);
  if (!(p > 0)) return null;
  return Math.round(((Number(cur) - p) / p) * 100);
}

// ───────── Month by month ─────────

type MonthRow = { ym: string } & PeriodTotals;

export function MonthlyBreakdown({ year, rows, total, selected }: { year: number; rows: MonthRow[]; total: PeriodTotals; selected: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(Number(r.value), Number(r.received))));
  return (
    <section aria-label="Month by month" className="surface-card overflow-hidden">
      <header className="flex flex-wrap items-end justify-between gap-2 px-4 pt-4 sm:px-6 sm:pt-5">
        <div>
          <h2 className="text-base font-bold sm:text-lg">Month by month · {year}</h2>
          <p className="text-xs text-[color:var(--color-ink-3)]">Orders booked each month and what happened to them. Click a month to open it.</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[color:var(--color-ink-3)]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-accent)]" />Sales value</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[color:var(--color-warn-fill)]" />Money received</span>
        </div>
      </header>

      {/* Bars */}
      <div className="flex h-44 items-end gap-2 overflow-x-auto px-4 pt-4 sm:gap-3 sm:px-6">
        {rows.map((r) => (
          <Link key={r.ym} href={`/dashboard?p=${r.ym}`} className={`group flex min-w-[44px] flex-1 flex-col items-center gap-1.5 rounded-md pb-1 ${r.ym === selected ? "bg-[color:var(--color-surface-2)]" : ""}`}>
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <span title={`Sales ${formatInr(r.value)}`} className="w-3 rounded-t bg-[color:var(--color-accent)] transition-opacity group-hover:opacity-80 sm:w-4" style={{ height: `${(Number(r.value) / max) * 100}%` }} />
              <span title={`Received ${formatInr(r.received)}`} className="w-3 rounded-t bg-[color:var(--color-warn-fill)] transition-opacity group-hover:opacity-80 sm:w-4" style={{ height: `${(Number(r.received) / max) * 100}%` }} />
            </div>
            <span className={`text-[11px] font-semibold ${r.ym === selected ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-ink-3)]"}`}>{monthShortName(monthOf(r.ym))}</span>
            <span className="text-[10px] tabular-nums text-[color:var(--color-ink-3)]">{compactInr(Number(r.value))}</span>
          </Link>
        ))}
      </div>

      {/* Table */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-left text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
              <th className="px-4 py-2.5 font-semibold sm:pl-6">Month</th>
              <th className="px-3 py-2.5 text-right font-semibold">Orders</th>
              <th className="px-3 py-2.5 text-right font-semibold">Sales value</th>
              <th className="px-3 py-2.5 text-right font-semibold">Money received</th>
              <th className="px-3 py-2.5 text-right font-semibold">Completed</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pending</th>
              <th className="px-3 py-2.5 text-right font-semibold">Collected on these orders</th>
              <th className="px-3 py-2.5 text-right font-semibold">Still to collect</th>
              <th className="px-3 py-2.5 text-right font-semibold sm:pr-6">Avg order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ym} className={`border-b border-[color:var(--color-border)] ${r.ym === selected ? "bg-[color:var(--color-gold-soft)]" : "hover:bg-[color:var(--color-surface-2)]"}`}>
                <td className="px-4 py-2.5 font-semibold sm:pl-6">
                  <Link href={`/dashboard?p=${r.ym}`} className="hover:underline">{monthShortName(monthOf(r.ym))} {r.ym.slice(0, 4)}</Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.orders}
                  {r.cancelled ? <span className="ml-1 text-[11px] text-[color:var(--color-ink-3)]">+{r.cancelled}✕</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatInr(r.value)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(r.received)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--color-ok)]">{r.completed} <span className="text-[11px] text-[color:var(--color-ink-3)]">({pct(r.completionPct)})</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--color-warn)]">{r.pending}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(r.paidOnOrders)} <span className="text-[11px] text-[color:var(--color-ink-3)]">({pct(r.collectedPct)})</span></td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[color:var(--color-warn)]">{formatInr(r.balance)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums sm:pr-6">{r.avgOrder ? formatInr(r.avgOrder) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-[color:var(--color-surface-2)] font-bold">
              <td className="px-4 py-3 sm:pl-6">
                <Link href={`/dashboard?p=${year}`} className="hover:underline">Year {year}</Link>
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{total.orders}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatInr(total.value)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatInr(total.received)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-ok)]">{total.completed} <span className="text-[11px] font-normal">({pct(total.completionPct)})</span></td>
              <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-warn)]">{total.pending}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatInr(total.paidOnOrders)} <span className="text-[11px] font-normal">({pct(total.collectedPct)})</span></td>
              <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-warn)]">{formatInr(total.balance)}</td>
              <td className="px-3 py-3 text-right tabular-nums sm:pr-6">{total.avgOrder ? formatInr(total.avgOrder) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───────── Team for the period ─────────

type EmpRow = { id: string; name: string; sharePct: number | null } & PeriodTotals;

export function TeamTable({ period, rows, total, label }: { period: Period; rows: EmpRow[]; total: PeriodTotals; label: string }) {
  const m = period.kind === "month" ? `&m=${periodKey(period)}` : "";
  return (
    <section aria-label="Team" className="surface-card overflow-hidden">
      <header className="px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 className="text-base font-bold sm:text-lg">Team · {label}</h2>
        <p className="text-xs text-[color:var(--color-ink-3)]">Each person’s orders in this period. Click a name to open their sheet.</p>
      </header>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-left text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
              <th className="px-4 py-2.5 font-semibold sm:pl-6">Employee</th>
              <th className="px-3 py-2.5 text-right font-semibold">Orders</th>
              <th className="px-3 py-2.5 text-right font-semibold">Sales value</th>
              <th className="px-3 py-2.5 text-right font-semibold">Share</th>
              <th className="px-3 py-2.5 text-right font-semibold">Money received</th>
              <th className="px-3 py-2.5 text-right font-semibold">Completed</th>
              <th className="px-3 py-2.5 text-right font-semibold">Pending</th>
              <th className="px-3 py-2.5 text-right font-semibold">Still to collect</th>
              <th className="px-3 py-2.5 text-right font-semibold sm:pr-6">Avg order</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--color-border)] hover:bg-[color:var(--color-surface-2)]">
                <td className="px-4 py-2.5 sm:pl-6">
                  <Link href={`/orders?sp=${r.id}${m}`} className="inline-flex items-center gap-2 font-semibold hover:underline">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-gold-soft)] text-xs font-bold text-[color:var(--color-gold)]">{r.name.slice(0, 1)}</span>
                    {r.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.orders}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatInr(r.value)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-[color:var(--color-surface-2)] sm:inline-block">
                      <span className="block h-full bg-[color:var(--color-accent)]" style={{ width: `${r.sharePct ?? 0}%` }} />
                    </span>
                    {pct(r.sharePct)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatInr(r.received)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--color-ok)]">{r.completed} <span className="text-[11px] text-[color:var(--color-ink-3)]">({pct(r.completionPct)})</span></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-[color:var(--color-warn)]">{r.pending}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-[color:var(--color-warn)]">{formatInr(r.balance)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums sm:pr-6">{r.avgOrder ? formatInr(r.avgOrder) : "—"}</td>
              </tr>
            ))}
            <tr className="bg-[color:var(--color-surface-2)] font-bold">
              <td className="px-4 py-3 sm:pl-6">Team total</td>
              <td className="px-3 py-3 text-right tabular-nums">{total.orders}</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatInr(total.value)}</td>
              <td className="px-3 py-3 text-right tabular-nums">100%</td>
              <td className="px-3 py-3 text-right tabular-nums">{formatInr(total.received)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-ok)]">{total.completed}</td>
              <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-warn)]">{total.pending}</td>
              <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-warn)]">{formatInr(total.balance)}</td>
              <td className="px-3 py-3 text-right tabular-nums sm:pr-6">{total.avgOrder ? formatInr(total.avgOrder) : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ───────── Team × month ─────────

export function TeamMonthGrid({
  year, months, rows, selected,
}: {
  year: number;
  months: string[];
  rows: Array<{ id: string; name: string; byMonth: Record<string, { value: string; orders: number }>; total: string; orders: number }>;
  selected: string;
}) {
  const monthTotal = (m: string) => rows.reduce((a, r) => a + Number(r.byMonth[m]?.value ?? 0), 0);
  const monthOrders = (m: string) => rows.reduce((a, r) => a + (r.byMonth[m]?.orders ?? 0), 0);
  const max = Math.max(1, ...rows.flatMap((r) => months.map((m) => Number(r.byMonth[m]?.value ?? 0))));
  return (
    <section aria-label="Sales by employee and month" className="surface-card overflow-hidden">
      <header className="px-4 pt-4 sm:px-6 sm:pt-5">
        <h2 className="text-base font-bold sm:text-lg">Sales by employee, every month · {year}</h2>
        <p className="text-xs text-[color:var(--color-ink-3)]">Sales value (orders) per person per month — darker = bigger month. Click a cell to open that sheet.</p>
      </header>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-y border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] text-[11px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
              <th className="sticky left-0 bg-[color:var(--color-surface-2)] px-4 py-2.5 text-left font-semibold sm:pl-6">Employee</th>
              {months.map((m) => (
                <th key={m} className={`px-2 py-2.5 text-right font-semibold ${m === selected ? "text-[color:var(--color-accent)]" : ""}`}>{monthShortName(monthOf(m))}</th>
              ))}
              <th className="px-3 py-2.5 text-right font-semibold sm:pr-6">Year</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[color:var(--color-border)]">
                <td className="sticky left-0 bg-[color:var(--color-surface)] px-4 py-2 font-semibold sm:pl-6">{r.name}</td>
                {months.map((m) => {
                  const c = r.byMonth[m];
                  const v = Number(c?.value ?? 0);
                  const shade = v > 0 ? 0.08 + (v / max) * 0.42 : 0;
                  return (
                    <td key={m} className="px-1 py-1 text-right">
                      <Link
                        href={`/orders?sp=${r.id}&m=${m}`}
                        title={c ? `${c.orders} orders · ${formatInr(c.value)}` : "No orders"}
                        className={`block rounded-md px-1.5 py-1.5 tabular-nums hover:ring-1 hover:ring-[color:var(--color-accent)] ${m === selected ? "ring-1 ring-[color:var(--color-gold)]" : ""}`}
                        style={{ backgroundColor: shade ? `rgba(15, 118, 110, ${shade})` : undefined }}
                      >
                        <span className="block text-[13px] font-semibold">{v ? compactInr(v) : "—"}</span>
                        <span className="block text-[10px] text-[color:var(--color-ink-3)]">{c?.orders ? `${c.orders} ord` : ""}</span>
                      </Link>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-bold tabular-nums sm:pr-6">
                  {compactInr(Number(r.total))}
                  <span className="block text-[10px] font-normal text-[color:var(--color-ink-3)]">{r.orders} ord</span>
                </td>
              </tr>
            ))}
            <tr className="bg-[color:var(--color-surface-2)] font-bold">
              <td className="sticky left-0 bg-[color:var(--color-surface-2)] px-4 py-2.5 sm:pl-6">Team</td>
              {months.map((m) => (
                <td key={m} className="px-2 py-2.5 text-right tabular-nums">
                  {compactInr(monthTotal(m))}
                  <span className="block text-[10px] font-normal text-[color:var(--color-ink-3)]">{monthOrders(m)} ord</span>
                </td>
              ))}
              <td className="px-3 py-2.5 text-right tabular-nums sm:pr-6">{compactInr(rows.reduce((a, r) => a + Number(r.total), 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
