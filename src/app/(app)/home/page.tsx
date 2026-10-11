import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { EmptyState } from "@/components/app/EmptyState";
import { Money } from "@/components/app/Money";
import { formatInr } from "@/lib/formatInr";
import { StatusPill, type AnyStatus } from "@/components/app/StatusPill";
import Decimal from "decimal.js";
import {
  salesMonthBooked,
  salesMonthTarget,
  salesOutstanding,
  salesRecentOrders,
  salesPendingActions,
} from "@/server/repo/salesHome";
import type { Role } from "@/server/repo/client";

const BANNER_KEY: Record<Exclude<Role, "SALES">, string> = {
  OWNER: "shell.roleBanner.owner",
  ADMIN: "shell.roleBanner.admin",
  ACCOUNTS: "shell.roleBanner.accounts",
  DISPATCH: "shell.roleBanner.dispatch",
};

export default async function HomePage() {
  const session = await requireSession();
  const t = await getTranslations();

  if (session.role !== "SALES") {
    return <EmptyState title={t(BANNER_KEY[session.role as Exclude<Role, "SALES">])} />;
  }

  return <SalesHome session={session} />;
}

async function SalesHome({ session }: { session: Awaited<ReturnType<typeof requireSession>> }) {
  const t = await getTranslations("salesHome");
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", timeZone: "Asia/Kolkata" }).toUpperCase();

  const [booked, target, outstanding, recent, pending] = await Promise.all([
    salesMonthBooked({
      tenantId: session.tenantId,
      salespersonId: session.userId,
      anchor: now,
    }),
    salesMonthTarget({ tenantId: session.tenantId, userId: session.userId, anchor: now }),
    salesOutstanding({ tenantId: session.tenantId, salespersonId: session.userId }),
    salesRecentOrders({ tenantId: session.tenantId, salespersonId: session.userId, limit: 5 }),
    salesPendingActions({ tenantId: session.tenantId, salespersonId: session.userId }),
  ]);

  const greeting = greetingByHour(now);
  const percent =
    target && !target.isZero()
      ? Number(booked.booked.div(target).mul(100).toFixed(0))
      : null;

  const needsYou = pending.rejectedPrice + pending.rejectedPayments;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-4">
      <header>
        <p className="text-sm text-[color:var(--color-ink-3)]">
          {t(`greeting.${greeting}`)}, {session.user.name.split(" ")[0]}
        </p>
      </header>

      {/* Month section */}
      <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
        <div className="label-caps">{monthLabel}</div>
        <div className="mt-1 flex items-baseline justify-between">
          <Money value={booked.booked.toString()} size="xl" />
          {target && (
            <div className="text-sm text-[color:var(--color-ink-3)] tabular-nums">
              {t("ofTarget")} {formatInr(target)}
            </div>
          )}
        </div>
        {target && percent !== null && (
          <div className="mt-3">
            <div className="relative h-2 overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
              <div
                data-gold
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-[color:var(--color-ink-3)] tabular-nums">
              {percent}%
            </div>
          </div>
        )}
        <div className="mt-3 text-xs text-[color:var(--color-ink-3)]">
          {booked.ordersCount} {t("orders")}
          {booked.ordersCount > 0 && (
            <> · {t("avgOrder")} {formatInr(booked.avgOrderValue)}</>
          )}
        </div>
      </section>

      {/* To collect */}
      {outstanding.openOrderCount > 0 && (
        <Link
          href="/collect"
          className="block rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 hover:bg-[color:var(--color-surface-2)]"
        >
          <div className="flex items-center justify-between">
            <div className="label-caps">{t("toCollect")}</div>
            <span className="text-sm text-[color:var(--color-ink-3)]">›</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <Money value={outstanding.outstanding.toString()} size="lg" />
            <span className="text-xs text-[color:var(--color-ink-3)]">
              {t("fromCount", { count: outstanding.openOrderCount })}
            </span>
          </div>
        </Link>
      )}

      {/* Needs you */}
      {needsYou > 0 && (
        <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
          <div className="label-caps mb-2">{t("needsYou")}</div>
          <ul className="space-y-1 text-sm">
            {pending.rejectedPrice > 0 && (
              <li>
                <Link
                  href={{ pathname: "/orders", query: { status: "CANCELLED" } }}
                  className="hover:underline"
                >
                  {t("rejectedPrice", { count: pending.rejectedPrice })} ›
                </Link>
              </li>
            )}
            {pending.rejectedPayments > 0 && (
              <li>
                <Link href="/orders" className="hover:underline">
                  {t("rejectedPayments", { count: pending.rejectedPayments })} ›
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Recent orders */}
      <section className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <header className="flex items-center justify-between bg-[color:var(--color-surface-2)] px-4 py-2">
          <h3 className="label-caps">{t("recentOrders")}</h3>
          <Link href="/orders" className="text-xs text-[color:var(--color-ink-2)] hover:underline">
            {t("seeAll")} ›
          </Link>
        </header>
        {recent.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-[color:var(--color-ink-3)]">
            {t("noOrders")}
          </p>
        ) : (
          <ul>
            {recent.map((o) => {
              const balanceDue = new Decimal(o.balanceDue).greaterThan(0);
              return (
                <li
                  key={o.id}
                  className="border-t border-[color:var(--color-border)] first:border-t-0"
                >
                  <Link
                    href={`/orders/${o.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[color:var(--color-surface-2)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {o.number} · {o.customerName}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs">
                        <StatusPill status={o.status as AnyStatus} />
                        {balanceDue && (
                          <span className="text-[color:var(--color-ink-3)]">
                            {formatInr(o.balanceDue)} {t("due")}
                          </span>
                        )}
                        {!balanceDue && (
                          <span className="text-[color:var(--color-ink-3)]">{t("paid")}</span>
                        )}
                      </div>
                    </div>
                    <Money value={o.total} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Sticky new-order button */}
      <div className="fixed inset-x-4 bottom-20 z-10 mx-auto max-w-sm">
        <Link
          href="/orders/new"
          data-gold
          className="flex h-12 items-center justify-center rounded-[var(--radius)] text-base font-medium shadow-[var(--shadow-2)]"
        >
          + {t("newOrder")}
        </Link>
      </div>
    </div>
  );
}

function greetingByHour(d: Date): "morning" | "afternoon" | "evening" {
  const istHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    })
      .formatToParts(d)
      .find((p) => p.type === "hour")!.value,
  );
  if (istHour < 12) return "morning";
  if (istHour < 17) return "afternoon";
  return "evening";
}
