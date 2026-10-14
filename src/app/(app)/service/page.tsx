// Service requests (spec §5). Sales log complaints and follow their own;
// Production / Admin see every request and mark them Done (or reopen).
import Link from "next/link";
import { redirect } from "next/navigation";
import { Search } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can, level } from "@/server/auth/permissions";
import { listServiceRequests, serviceCounts } from "@/server/services/serviceRequestService";
import { NewServiceForm } from "./_components/NewServiceForm";
import { ServiceList } from "./_components/ServiceList";

type SearchParams = { [k: string]: string | string[] | undefined };
type Filter = "pending" | "done" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
];

export default async function ServicePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  // SALES is "own"-scoped: allowed in, but only ever sees requests they created.
  if (!can(session.role, "service.view", { isOwn: true })) redirect("/home");
  const ownOnly = level(session.role, "service.view") === "own";
  const canCreate = can(session.role, "service.create");
  const canUpdate = can(session.role, "service.update");

  const sp = await searchParams;
  const rawF = typeof sp.f === "string" ? sp.f : "";
  // Production's job is the open queue; Sales want to see everything they logged.
  const f: Filter = rawF === "pending" || rawF === "done" || rawF === "all" ? rawF : canUpdate ? "pending" : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";

  const createdById = ownOnly ? session.userId : undefined;
  const [rows, counts] = await Promise.all([
    listServiceRequests({
      tenantId: session.tenantId,
      createdById,
      status: f === "pending" ? "PENDING" : f === "done" ? "DONE" : undefined,
      q: q || undefined,
    }),
    serviceCounts(session.tenantId, { createdById }),
  ]);

  const href = (nf: Filter) => {
    const p = new URLSearchParams({ f: nf });
    if (q) p.set("q", q);
    return `/service?${p.toString()}`;
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 md:px-6">
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Service requests</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
          {ownOnly ? "Requests you logged · " : ""}
          <span className="font-semibold text-[color:var(--color-warn)]">{counts.pending} pending</span>
          {" · "}
          <span className="font-semibold text-[color:var(--color-ok)]">{counts.doneThisMonth} done this month</span>
          {" · "}
          {counts.free} free · {counts.paid} paid
        </p>
      </header>

      {canCreate && <NewServiceForm />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="inline-flex w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-1 sm:w-auto" aria-label="Filter">
          {FILTERS.map((x) => (
            <Link
              key={x.key}
              href={href(x.key)}
              aria-current={f === x.key ? "page" : undefined}
              className={
                "flex-1 rounded-[calc(var(--radius)-2px)] px-4 py-2 text-center text-sm font-medium transition-colors sm:flex-none " +
                (f === x.key
                  ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]"
                  : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]")
              }
            >
              {x.label}
              {x.key === "pending" && counts.pending > 0 ? ` (${counts.pending})` : ""}
            </Link>
          ))}
        </nav>
        <form method="GET" action="/service" className="relative w-full sm:w-80" role="search">
          <input type="hidden" name="f" value={f} />
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--color-ink-3)]" aria-hidden />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search name, phone, SR no., product"
            className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] pl-9 pr-3 text-base text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ink)]/60 sm:text-sm"
          />
        </form>
      </div>

      <ServiceList
        rows={rows.map((r) => ({
          id: r.id,
          number: r.number,
          createdAt: r.createdAt.toISOString(),
          customerName: r.customerName,
          phone: r.phone,
          address: r.address,
          product: r.product,
          complaint: r.complaint,
          notes: r.notes,
          serviceType: r.serviceType,
          status: r.status,
          doneAt: r.doneAt ? r.doneAt.toISOString() : null,
          createdByName: r.createdByName,
          doneByName: r.doneByName,
        }))}
        canUpdate={canUpdate}
        showCreator={!ownOnly}
        emptyText={
          q
            ? `No service requests match “${q}”.`
            : f === "pending"
              ? "No pending service requests."
              : f === "done"
                ? "Nothing marked done yet."
                : "No service requests yet."
        }
      />
    </div>
  );
}
