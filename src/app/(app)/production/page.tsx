// Production board (spec 2026-10-15 §4) — every pending order from every
// salesperson, sorted by delivery date. No money anywhere on this page.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Search } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import {
  countProductionTabs,
  listProductionOrders,
  PRODUCTION_TABS,
  type ProductionTab,
} from "@/server/repo/production";
import { ProductionBoard } from "./ProductionBoard";
import { istDayKey } from "./deliveryBadge";

type SearchParams = { [k: string]: string | string[] | undefined };

const TAB_LABEL: Record<ProductionTab, string> = {
  todo: "To do",
  progress: "On progress",
  finished: "Finished — ready to deliver",
  delivered: "Delivered (30 days)",
};

const TAB_HINT: Record<ProductionTab, string> = {
  todo: "Not started yet. Tap Start when work begins.",
  progress: "Being built now. Tap Mark Finished when the machine is ready.",
  finished: "Ready — waiting for sales to deliver.",
  delivered: "Delivered in the last 30 days (read-only).",
};

export default async function ProductionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  // SALES has "own" production.view (for their order pages) — the board itself is production/admin only.
  const allowed =
    (session.role === "PRODUCTION" || session.role === "OWNER" || session.role === "ADMIN") &&
    can(session.role, "production.view");
  if (!allowed) redirect("/home");

  const sp = await searchParams;
  const tab: ProductionTab =
    typeof sp.tab === "string" && (PRODUCTION_TABS as readonly string[]).includes(sp.tab)
      ? (sp.tab as ProductionTab)
      : "todo";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const [rows, counts] = await Promise.all([
    listProductionOrders({ tenantId: session.tenantId, tab, q: q || undefined }),
    countProductionTabs(session.tenantId),
  ]);

  const hrefFor = (t: ProductionTab) => {
    const p = new URLSearchParams();
    if (t !== "todo") p.set("tab", t);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/production${s ? `?${s}` : ""}`;
  };
  const exportParams = new URLSearchParams({ tab });
  if (q) exportParams.set("q", q);

  const isAdmin = session.role === "OWNER" || session.role === "ADMIN";
  const open = counts.todo + counts.progress + counts.finished;

  return (
    <div className="mx-auto w-full max-w-[1600px] min-w-0 px-4 py-5 md:px-6 md:py-7">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Production</h1>
          <p className="mt-0.5 text-sm text-[color:var(--color-ink-3)]">
            {open} open {open === 1 ? "order" : "orders"} from all salespeople · sorted by delivery date
          </p>
        </div>
        <a
          href={`/production/export?${exportParams.toString()}`}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
        >
          <Download className="h-4 w-4" aria-hidden />
          Export to Excel
        </a>
      </header>

      {/* Tabs */}
      <nav aria-label="Production status" className="mb-3">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {PRODUCTION_TABS.map((t) => {
            const on = t === tab;
            return (
              <li key={t}>
                <Link
                  href={hrefFor(t)}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-gold)] ${
                    on
                      ? "border-[color:var(--color-gold)] bg-[color:var(--color-gold)] text-[color:var(--color-gold-ink)]"
                      : "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] text-[color:var(--color-ink)] hover:border-[color:var(--color-gold)] hover:text-[color:var(--color-gold)]"
                  }`}
                >
                  {TAB_LABEL[t]}
                  <span
                    className={`rounded-full px-1.5 py-px text-xs tabular-nums ${
                      on
                        ? "bg-[color:var(--color-surface)] text-[color:var(--color-gold)]"
                        : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)]"
                    }`}
                  >
                    {counts[t]}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Search */}
      <form action="/production" method="get" role="search" className="surface-card mb-4 flex items-center gap-2 p-3">
        {tab !== "todo" && <input type="hidden" name="tab" value={tab} />}
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search orders</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-ink-3)]"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Customer, phone or product"
            className="h-11 w-full rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] pl-9 pr-3 text-base sm:text-sm"
          />
        </label>
        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] px-4 text-sm font-medium hover:border-[color:var(--color-gold)]"
        >
          Search
        </button>
        {q && (
          <Link
            href={tab === "todo" ? "/production" : `/production?tab=${tab}`}
            className="inline-flex h-11 shrink-0 items-center px-2 text-sm text-[color:var(--color-ink-3)] underline-offset-2 hover:underline"
          >
            Clear
          </Link>
        )}
      </form>

      <p className="mb-3 px-1 text-sm text-[color:var(--color-ink-3)]">
        {TAB_HINT[tab]}
        {q ? ` · ${rows.length} matching “${q}”` : ""}
      </p>

      <ProductionBoard rows={rows} tab={tab} todayKey={istDayKey(new Date())} linkOrders={isAdmin} />
    </div>
  );
}
