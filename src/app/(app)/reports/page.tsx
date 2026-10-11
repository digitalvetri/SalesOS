// §11.14 Reports — export to Excel. [GOLD] = none needed beyond the per-report
// download; the primary action is the first report's download.
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { REPORTS } from "@/server/services/reportService";
import { resolvePeriod } from "@/server/domain/dashboard/period";
import { Download } from "lucide-react";

type SearchParams = { [k: string]: string | string[] | undefined };
const ymd = (v: string | string[] | undefined) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  if (!can(session.role, "reports.export", { isOwn: true })) redirect("/home");
  const t = await getTranslations("reports");
  const sp = await searchParams;
  const def = resolvePeriod("this_month", new Date());
  const from = ymd(sp.from) ?? def.from;
  const to = ymd(sp.to) ?? def.to;
  const entities = await prisma.billingEntity.findMany({ where: { tenantId: session.tenantId, active: true }, orderBy: { code: "asc" }, select: { id: true, code: true } });
  const entity = entities.some((e) => e.id === sp.entity) ? (sp.entity as string) : "";
  const qs = new URLSearchParams({ from, to, ...(entity ? { entity } : {}) }).toString();
  const input = "h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {session.role === "SALES" && <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{t("ownOnly")}</p>}
      <form method="GET" action="/reports" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("from")}</span>
          <input type="date" name="from" defaultValue={from} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("to")}</span>
          <input type="date" name="to" defaultValue={to} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("entity")}</span>
          <select name="entity" defaultValue={entity} className={input}>
            <option value="">{entities.map((e) => e.code).join("+")}</option>
            {entities.map((e) => <option key={e.id} value={e.id}>{e.code}</option>)}
          </select>
        </label>
        <button type="submit" className={`${input} px-4 hover:bg-[color:var(--color-surface-2)]`}>{t("apply")}</button>
      </form>
      <ul className="mt-6 divide-y divide-[color:var(--color-border)] rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        {REPORTS.map((k, i) => (
          <li key={k} className="flex items-center justify-between gap-4 p-4">
            <div>
              <div className="font-medium">{t(`r.${k}.name`)}</div>
              <div className="text-xs text-[color:var(--color-ink-3)]">{t(`r.${k}.desc`)}</div>
            </div>
            <a
              href={`/api/reports/${k}?${qs}`}
              {...(i === 0 ? { "data-gold": "true" } : {})}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] px-4 text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
              download
            >
              <Download className="h-4 w-4" aria-hidden />
              {t("download")}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
