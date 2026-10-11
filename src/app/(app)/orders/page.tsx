import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan, can, level } from "@/server/auth/permissions";
import { listOrders, type OrderListFilters } from "@/server/repo/orders";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { StatusPill, type AnyStatus } from "@/components/app/StatusPill";
import type { OrderStatus } from "@/server/repo/client";

const STATUS_FILTERS: readonly OrderStatus[] = [
  "PENDING_APPROVAL",
  "CONFIRMED",
  "IN_PRODUCTION",
  "READY",
  "PARTIALLY_DISPATCHED",
  "DISPATCHED",
  "DELIVERED",
  "CLOSED",
  "CANCELLED",
];

type SearchParams = { [k: string]: string | string[] | undefined };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireSession();
  try {
    assertCan(session.role, "orders.view", { isOwn: true });
  } catch {
    redirect("/home");
  }
  const sp = await searchParams;
  const t = await getTranslations("orders");

  const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
  const date = (v: string | string[] | undefined) => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : undefined;
  };
  // Dashboard click-throughs (§9 "no dead-end numbers") add from/to/entity/sp/refund/cancelReq.
  const filters: OrderListFilters = {
    statuses: toStatusArray(sp.status),
    hasBalance: sp.balance === "due" ? true : sp.balance === "paid" ? false : undefined,
    refundDue: sp.balance === "refund" || undefined,
    cancelRequested: sp.cancelReq === "1" || undefined,
    dateFrom: date(sp.from),
    dateTo: date(sp.to),
    entityId: str(sp.entity),
    salespersonId: session.role === "SALES" ? undefined : str(sp.sp),
    search: typeof sp.q === "string" ? sp.q : undefined,
  };

  // SALES role sees own orders only (§4.2); other roles see all.
  const salespersonScope = session.role === "SALES" ? session.userId : undefined;

  const rows = await listOrders({
    tenantId: session.tenantId,
    filters,
    salespersonScope,
    limit: 200,
  });

  const canCreate = can(session.role, "orders.create", { isOwn: true });
  const canSeeMoney = level(session.role, "orders.viewPrices") !== "denied";

  return (
    <div className="px-6 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canCreate && (
          <Link
            href="/orders/new"
            data-gold
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-5 text-sm font-medium"
          >
            {t("newOrder")}
          </Link>
        )}
      </header>

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/orders" method="GET">
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("filterSearch")}</span>
          <input
            type="search"
            name="q"
            defaultValue={typeof sp.q === "string" ? sp.q : ""}
            placeholder={t("searchPlaceholder")}
            className="h-10 w-72 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("filterStatus")}</span>
          <select
            name="status"
            defaultValue={typeof sp.status === "string" ? sp.status : ""}
            className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
          >
            <option value="">{t("statusAny")}</option>
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("filterBalance")}</span>
          <select
            name="balance"
            defaultValue={typeof sp.balance === "string" ? sp.balance : ""}
            className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm"
          >
            <option value="">{t("balanceAny")}</option>
            <option value="due">{t("balanceDue")}</option>
            <option value="paid">{t("balancePaid")}</option>
            <option value="refund">{t("balanceRefund")}</option>
          </select>
        </label>
        {/* Keep dashboard click-through filters when re-applying. */}
        {(["from", "to", "entity", "sp", "cancelReq"] as const).map((k) =>
          typeof sp[k] === "string" && sp[k] ? <input key={k} type="hidden" name={k} value={sp[k] as string} /> : null,
        )}
        <button
          type="submit"
          className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm hover:bg-[color:var(--color-surface-2)]"
        >
          {t("apply")}
        </button>
      </form>

      {(filters.dateFrom || filters.dateTo || filters.entityId || filters.salespersonId || filters.cancelRequested) && (
        <p className="mb-4 text-sm text-[color:var(--color-ink-2)]">
          {t("filteredView", {
            range: [str(sp.from), str(sp.to)].filter(Boolean).join(" → ") || "—",
          })}{" "}
          <Link href="/orders" className="underline underline-offset-2">
            {t("clearFilters")}
          </Link>
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <tr>
                <th className="px-4 py-3">{t("colNumber")}</th>
                <th className="px-4 py-3">{t("colDate")}</th>
                <th className="px-4 py-3">{t("colCustomer")}</th>
                <th className="px-4 py-3">{t("colSalesperson")}</th>
                <th className="px-4 py-3">{t("colItems")}</th>
                {canSeeMoney && (
                  <>
                    <th className="px-4 py-3 text-right">{t("colTotal")}</th>
                    <th className="px-4 py-3 text-right">{t("colBalance")}</th>
                  </>
                )}
                <th className="px-4 py-3">{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/orders/${o.id}`} className="hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    {o.orderDate.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{o.customer.name}</div>
                    <div className="text-xs text-[color:var(--color-ink-3)] tabular-nums">
                      {o.customer.phoneE164}
                    </div>
                  </td>
                  <td className="px-4 py-3">{o.salesperson.name}</td>
                  <td className="px-4 py-3 text-[color:var(--color-ink-2)]">
                    <Badge tone="neutral">{o.entity.code}</Badge>{" "}
                    <span className="ml-1">{o._count.lines} line(s)</span>
                  </td>
                  {canSeeMoney && (
                    <>
                      <td className="px-4 py-3 text-right">
                        <Money value={o.total.toString()} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Money value={o.balanceDue.toString()} />
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3">
                    <StatusPill status={o.status as AnyStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function toStatusArray(v: string | string[] | undefined): OrderStatus[] | undefined {
  if (!v) return undefined;
  const arr = Array.isArray(v) ? v : [v];
  const filtered = arr.filter((s): s is OrderStatus =>
    STATUS_FILTERS.includes(s as OrderStatus),
  );
  return filtered.length > 0 ? filtered : undefined;
}
