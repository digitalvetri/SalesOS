// §11.7 Admin dashboard. [GOLD] = "Collected (verified)" hero figure — the only
// gold on the page. Every number links to the list that produces it (§9).
// Owner/Admin see everything; Accounts sees the money tiles only (§4.2 👁).
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Decimal from "decimal.js";
import { requireSession } from "@/server/auth/session";
import { can, level } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { adminDashboard } from "@/server/services/dashboardService";
import { resolvePeriod, type PeriodKey } from "@/server/domain/dashboard/period";
import { addDays } from "@/server/domain/payment/collect";
import { Money } from "@/components/app/Money";
import { CountUp } from "@/components/app/CountUp";
import { cn } from "@/lib/utils";
import { TrendChart } from "./TrendChart";

const PERIODS: PeriodKey[] = ["this_month", "last_month", "last_30", "this_fy"];
type SearchParams = { [k: string]: string | string[] | undefined };

function monthEnd(m: string) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  if (!can(session.role, "admin.dashboard")) redirect("/home");
  const moneyOnly = level(session.role, "admin.dashboard") === "readOnly";

  const sp = await searchParams;
  const t = await getTranslations("dashboard");
  const periodKey = PERIODS.includes(sp.period as PeriodKey) ? (sp.period as PeriodKey) : "this_month";
  const now = new Date();
  const period = resolvePeriod(periodKey, now);
  const entities = await prisma.billingEntity.findMany({
    where: { tenantId: session.tenantId, active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true },
  });
  const entityId = entities.some((e) => e.id === sp.entity) ? (sp.entity as string) : undefined;
  const d = await adminDashboard({ tenantId: session.tenantId, entityId }, period, now);

  const q = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...(entityId ? { entity: entityId } : {}), ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const range = { from: period.from, to: period.to };
  const prevLabel =
    periodKey === "this_month" || periodKey === "last_month"
      ? new Date(`${addDays(period.from, -1)}T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })
      : t("prevPeriod");

  const selectClass =
    "h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm";

  return (
    <div className="px-4 py-6 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <form method="GET" action="/dashboard" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="sr-only">{t("period")}</span>
            <select name="period" defaultValue={periodKey} className={selectClass}>
              {PERIODS.map((p) => (
                <option key={p} value={p}>{t(`periods.${p}`)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="sr-only">{t("entity")}</span>
            <select name="entity" defaultValue={entityId ?? ""} className={selectClass}>
              <option value="">{entities.map((e) => e.code).join("+")}</option>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>{e.code}</option>
              ))}
            </select>
          </label>
          <button type="submit" className={cn(selectClass, "px-4 hover:bg-[color:var(--color-surface-2)]")}>{t("apply")}</button>
        </form>
      </header>

      {/* Money tiles */}
      <section aria-label={t("moneyTiles")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile href={`/orders${q(range)}`} label={t("booked")}>
          <CountUp value={d.booked.value} className="text-2xl font-semibold tabular-nums" />
          <p className="text-xs text-[color:var(--color-ink-3)]">
            {d.booked.changePct === null
              ? t("noComparison")
              : t("vsPrev", { sign: d.booked.changePct >= 0 ? "▲" : "▼", pct: Math.abs(d.booked.changePct), prev: prevLabel })}
          </p>
        </Tile>
        <Tile href={`/payments/collected${q(range)}`} label={t("collected")} hero>
          <span data-gold="true" className="inline-block rounded-[var(--radius)] px-2 py-0.5">
            <CountUp value={d.collected} className="text-2xl font-semibold tabular-nums" />
          </span>
          <p className="text-xs text-[color:var(--color-ink-3)]">{t("collectedNote")}</p>
        </Tile>
        <Tile href="/payments" label={t("awaiting")}>
          <CountUp value={d.awaiting.value} className="text-2xl font-semibold tabular-nums" />
          <p className="text-xs text-[color:var(--color-ink-3)]">{t("payments", { count: d.awaiting.count })}</p>
        </Tile>
        <Tile href="/payments/cash" label={t("cashWithStaff")}>
          <CountUp value={d.cash.value} className="text-2xl font-semibold tabular-nums" />
          <p className="text-xs text-[color:var(--color-ink-3)]">{t("people", { count: d.cash.count })}</p>
        </Tile>
        <Tile href="/collect" label={t("outstanding")}>
          <CountUp value={d.outstanding.value} className="text-2xl font-semibold tabular-nums" />
          <p className="text-xs text-[color:var(--color-ink-3)]">
            {t("overdueShort")} <Money value={d.outstanding.overdue} className="text-xs" />
          </p>
        </Tile>
      </section>

      {!moneyOnly && (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Panel title={t("trendTitle")}>
              <TrendChart
                title={t("trendTitle")}
                points={d.trend.map((p) => ({ ...p, href: `/orders${q({ from: `${p.month}-01`, to: monthEnd(p.month) })}` }))}
              />
            </Panel>
            <Panel title={t("needsAction")}>
              <ul className="divide-y divide-[color:var(--color-border)] text-sm">
                <ActionRow href="/orders?status=PENDING_APPROVAL" label={t("na.approvals", { count: d.needsAction.approvals })} cta={t("review")} n={d.needsAction.approvals} />
                <ActionRow href="/payments" label={t("na.verify", { count: d.needsAction.toVerify })} cta={t("verify")} n={d.needsAction.toVerify} />
                <ActionRow href="/dispatch" label={t("na.stuck", { count: d.needsAction.stuck })} cta={t("view")} n={d.needsAction.stuck} />
                <ActionRow href="/orders?cancelReq=1" label={t("na.cancel", { count: d.needsAction.cancelRequests })} cta={t("review")} n={d.needsAction.cancelRequests} />
                <ActionRow href="/orders?balance=refund" label={t("na.refunds", { count: d.needsAction.refundsDue })} cta={t("view")} n={d.needsAction.refundsDue} />
              </ul>
            </Panel>
          </div>

          <Panel title={t("salesTeam")} className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                  <tr>
                    <th className="py-2 pr-3">{t("lb.name")}</th>
                    <th className="py-2 pr-3 text-right">{t("lb.booked")}</th>
                    <th className="py-2 pr-3 text-right">{t("lb.target")}</th>
                    <th className="py-2 pr-3 text-right">%</th>
                    <th className="py-2 pr-3 text-right">{t("lb.orders")}</th>
                    <th className="py-2 pr-3 text-right">{t("lb.avg")}</th>
                    <th className="py-2 text-right">{t("lb.collected")}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.leaderboard.map((r) => (
                    <tr key={r.userId} className="border-t border-[color:var(--color-border)]">
                      <td className="py-2 pr-3">
                        <Link href={`/orders${q({ ...range, sp: r.userId })}`} className="hover:underline">{r.name}</Link>
                      </td>
                      <td className="py-2 pr-3 text-right"><Money value={r.booked} /></td>
                      <td className="py-2 pr-3 text-right"><Money value={r.target} muted /></td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.pct === null ? "—" : `${r.pct}%`}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.orders}</td>
                      <td className="py-2 pr-3 text-right"><Money value={r.avgOrder} muted /></td>
                      <td className="py-2 text-right"><Money value={r.collected} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel title={t("aging")}>
              <BarList
                rows={d.outstanding.aging.map((a) => ({ label: t(`agingBucket.${a.bucket}`), value: a.amount, href: "/collect?f=overdue" }))}
              />
            </Panel>
            <Panel title={t("topMachines")}>
              <ul className="space-y-1 text-sm">
                {d.products.byQty.length === 0 && <li className="text-[color:var(--color-ink-3)]">{t("nothingYet")}</li>}
                {d.products.byQty.map((p) => (
                  <li key={p.key} className="flex justify-between gap-3">
                    <span className="truncate">{p.name}</span>
                    <span className="tabular-nums">{p.qty}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title={t("cancellations")}>
              <ul className="space-y-1 text-sm">
                {d.cancellations.reasons.length === 0 && <li className="text-[color:var(--color-ink-3)]">{t("nothingYet")}</li>}
                {d.cancellations.reasons.map((r) => (
                  <li key={r.reason}>
                    <Link href={`/orders${q({ status: "CANCELLED", ...range })}`} className="flex justify-between gap-3 hover:underline">
                      <span>{t(`reason.${r.reason}`)}</span>
                      <span className="tabular-nums">{r.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Panel title={t("topCustomers")}>
              <ul className="space-y-1 text-sm">
                {d.customers.top.length === 0 && <li className="text-[color:var(--color-ink-3)]">{t("nothingYet")}</li>}
                {d.customers.top.map((c) => (
                  <li key={c.customerId}>
                    <Link href={`/customers/${c.customerId}`} className="flex justify-between gap-3 hover:underline">
                      <span className="truncate">{c.name}</span>
                      <Money value={c.booked} />
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">{t("repeatCustomers", { count: d.customers.repeatCustomers })}</p>
            </Panel>
            <Panel title={t("topMachinesValue")}>
              <BarList rows={d.products.byValue.map((p) => ({ label: p.name, value: p.value }))} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ href, label, hero, children }: { href: string; label: string; hero?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-[var(--radius)] border bg-[color:var(--color-surface)] p-4 hover:bg-[color:var(--color-surface-2)]",
        hero ? "border-[color:var(--color-border-strong)]" : "border-[color:var(--color-border)]",
      )}
    >
      <div className="label-caps">{label}</div>
      <div className="mt-1 space-y-1">{children}</div>
    </Link>
  );
}

function Panel({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4", className)}>
      <h2 className="label-caps mb-3">{title}</h2>
      {children}
    </section>
  );
}

function ActionRow({ href, label, cta, n }: { href: string; label: string; cta: string; n: number }) {
  return (
    <li>
      <Link href={href} className={cn("flex items-center justify-between gap-3 py-2 hover:underline", n === 0 && "text-[color:var(--color-ink-3)]")}>
        <span>{label}</span>
        <span className="text-xs">{cta} ›</span>
      </Link>
    </li>
  );
}

/** Single-series horizontal bars: value at the tip, 4px rounded data-end, one hue. */
function BarList({ rows }: { rows: { label: string; value: string; href?: string }[] }) {
  const max = rows.reduce((m, r) => Decimal.max(m, r.value), new Decimal(0));
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => {
        const pct = max.isZero() ? 0 : new Decimal(r.value).div(max).times(100).toNumber();
        const inner = (
          <>
            <div className="flex justify-between gap-3">
              <span className="truncate">{r.label}</span>
              <Money value={r.value} className="text-sm" />
            </div>
            <div className="mt-1 h-2 rounded-r-[4px]" aria-hidden>
              <div className="h-2 rounded-r-[4px] bg-[color:var(--color-chart)]" style={{ width: `${pct}%` }} />
            </div>
          </>
        );
        return <li key={r.label}>{r.href ? <Link href={r.href} className="block hover:underline">{inner}</Link> : inner}</li>;
      })}
    </ul>
  );
}
