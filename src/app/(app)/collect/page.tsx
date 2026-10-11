// §11.6 Collect — Sales: own · Admin/Accounts: all. [GOLD] = total outstanding figure.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { getCollectView } from "@/server/repo/collect";
import { reminderText, waLink, type CollectFilter } from "@/server/domain/payment/collect";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { StatusPill, type AnyStatus } from "@/components/app/StatusPill";
import { ContactButtons } from "./ContactButtons";
import { PromiseDateSheet } from "./PromiseDateSheet";

const FILTERS: CollectFilter[] = ["all", "overdue", "week", "today"];
type SearchParams = { [k: string]: string | string[] | undefined };

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });

export default async function CollectPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  // Same row as "Record payment": Sales own, Owner/Admin/Accounts all, Dispatch never.
  if (!can(session.role, "payments.record", { isOwn: true })) redirect("/home");

  const sp = await searchParams;
  const filter: CollectFilter = FILTERS.includes(sp.f as CollectFilter) ? (sp.f as CollectFilter) : "all";
  const t = await getTranslations("collect");
  const view = await getCollectView({
    tenantId: session.tenantId,
    salespersonScope: session.role === "SALES" ? session.userId : undefined,
    filter,
  });
  const showSalesperson = session.role !== "SALES";
  const now = view.generatedAt;

  const ago = (at: Date) => {
    const days = Math.floor((now - at.getTime()) / 86_400_000);
    return days === 0 ? t("today") : t("daysAgo", { days });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      <div className="mt-2 flex items-baseline gap-3">
        <span data-gold="true" className="rounded-[var(--radius)] px-2 py-0.5">
          <Money value={view.outstanding} size="xl" />
        </span>
        <span className="text-sm text-[color:var(--color-ink-2)]">{t("outstanding")}</span>
      </div>

      <nav aria-label={t("filters")} className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "/collect" : `/collect?f=${f}`}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              filter === f
                ? "border-[color:var(--color-ink)] bg-[color:var(--color-surface-2)] font-medium"
                : "border-[color:var(--color-border-strong)] text-[color:var(--color-ink-2)]",
            )}
          >
            {t(`filter.${f}`)}
            {f !== "all" && view.counts[f] > 0 && <span className="ml-1 tabular-nums">{view.counts[f]}</span>}
          </Link>
        ))}
      </nav>

      {view.groups.length === 0 ? (
        <p className="py-16 text-center text-base text-[color:var(--color-ink-2)]">
          {filter === "all" ? t("emptyAll") : t("emptyFilter")}
        </p>
      ) : (
        <ul className="mt-5 space-y-4">
          {view.groups.map((g) => {
            const remindable = g.orders.filter((o) => !o.reminderBlockedUntil);
            const blockedUntil =
              remindable.length === 0
                ? g.orders
                    .map((o) => o.reminderBlockedUntil!)
                    .sort((a, b) => a.getTime() - b.getTime())[0]!
                    .toISOString()
                : null;
            const href = waLink(
              g.customer.phoneE164,
              reminderText({
                customerName: g.customer.name,
                entityName: g.orders[0]!.entityName,
                orders: (remindable.length > 0 ? remindable : g.orders).map((o) => ({
                  number: o.number,
                  balanceDue: o.balanceDue,
                })),
              }),
            );
            return (
              <li
                key={g.customer.id}
                className={cn(
                  "rounded-[var(--radius)] border bg-[color:var(--color-surface)] p-4",
                  g.overdue ? "border-[color:var(--color-warn)]" : "border-[color:var(--color-border)]",
                )}
                data-testid="collect-group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/customers/${g.customer.id}`} className="font-medium hover:underline">
                      {g.overdue && <span aria-hidden>⚠ </span>}
                      {g.customer.name}
                    </Link>
                    {g.orders.length > 1 && (
                      <span className="text-sm text-[color:var(--color-ink-3)]">
                        {" "}
                        · {t("ordersCount", { count: g.orders.length })}
                      </span>
                    )}
                    <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                      {g.overdue && (
                        <span className="text-[color:var(--color-warn)]">
                          {t("overdueDays", { days: g.maxDaysOverdue })}
                        </span>
                      )}
                      {g.overdue && g.lastFollowUp && " · "}
                      {g.lastFollowUp &&
                        t("lastContact", {
                          channel: t(`channel.${g.lastFollowUp.channel}`),
                          ago: ago(g.lastFollowUp.at),
                        })}
                    </div>
                  </div>
                  <Money value={g.total} />
                </div>

                <ul className="mt-3 divide-y divide-[color:var(--color-border)] border-y border-[color:var(--color-border)]">
                  {g.orders.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <div className="min-w-0">
                        <Link href={`/orders/${o.id}`} className="font-medium hover:underline">
                          {o.number}
                        </Link>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-[color:var(--color-ink-3)]">
                          {o.overdue ? (
                            <Badge tone="warn">{t("overdueDays", { days: o.daysOverdue })}</Badge>
                          ) : o.dueOn ? (
                            <span>{t("dueOn", { date: fmtDay(o.dueOn) })}</span>
                          ) : (
                            <span>{t("noDueDate")}</span>
                          )}
                          <StatusPill status={o.status as AnyStatus} />
                          {showSalesperson && <span>{o.salespersonName}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Money value={o.balanceDue} />
                        <PromiseDateSheet
                          orderId={o.id}
                          orderNumber={o.number}
                          current={o.promisedPaymentDate}
                          today={view.today}
                          compact
                        />
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-3">
                  <ContactButtons
                    phoneE164={g.customer.phoneE164}
                    orderIds={(remindable.length > 0 ? remindable : g.orders).map((o) => o.id)}
                    reminderHref={href}
                    reminderBlockedUntil={blockedUntil}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
