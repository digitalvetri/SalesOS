// Verified collections for a period — the click-through for the dashboard's
// "Collected (verified)" hero (§9: every tile opens the list that produces it).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listCollected } from "@/server/repo/payments";
import { resolvePeriod } from "@/server/domain/dashboard/period";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";

type SearchParams = { [k: string]: string | string[] | undefined };
const ymd = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function CollectedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const t = await getTranslations("payments");
  const tm = await getTranslations("recordPayment.methods");
  const def = resolvePeriod("this_month", new Date());
  const from = ymd(sp.from) ?? def.from;
  const to = ymd(sp.to) ?? def.to;
  const entityId = typeof sp.entity === "string" && sp.entity ? sp.entity : undefined;
  const { rows, net } = await listCollected({ tenantId: session.tenantId, from, to, entityId });

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("collectedTitle")}</h1>
        <p className="text-sm text-[color:var(--color-ink-2)]">
          {from} → {to} · <Money value={net} />
        </p>
      </header>
      <form className="mb-5 flex flex-wrap items-end gap-3" method="GET" action="/payments/collected">
        {(["from", "to"] as const).map((k) => (
          <label key={k} className="flex flex-col gap-1 text-xs">
            <span className="label-caps">{t(k === "from" ? "fromDate" : "toDate")}</span>
            <input type="date" name={k} defaultValue={k === "from" ? from : to}
              className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm" />
          </label>
        ))}
        {entityId && <input type="hidden" name="entity" value={entityId} />}
        <button type="submit" className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm hover:bg-[color:var(--color-surface-2)]">
          {t("apply")}
        </button>
      </form>
      {rows.length === 0 ? (
        <p className="py-12 text-center text-[color:var(--color-ink-2)]">{t("emptyCollected")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <tr>
                <th className="px-3 py-3">{t("colReceipt")}</th>
                <th className="px-3 py-3">{t("colOrder")}</th>
                <th className="px-3 py-3 text-right">{t("colAmount")}</th>
                <th className="px-3 py-3">{t("colMethod")}</th>
                <th className="px-3 py-3">{t("colInto")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-3 py-3">
                    <div className="tabular-nums">{r.receiptNo}</div>
                    <div className="text-xs text-[color:var(--color-ink-3)]">
                      {r.paidOn.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })} · {r.salesperson}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Link href={`/orders/${r.order.id}`} className="font-medium hover:underline">{r.order.number}</Link>
                    <div className="text-xs text-[color:var(--color-ink-3)]">{r.order.customerName}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.type === "REFUND" && <Badge tone="danger" className="mr-2">{t("refund")}</Badge>}
                    <Money value={r.type === "REFUND" ? `-${r.amount}` : r.amount} />
                  </td>
                  <td className="px-3 py-3">{tm(r.method)}</td>
                  <td className="px-3 py-3">{r.into}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
