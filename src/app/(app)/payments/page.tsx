// §11.8 Verify queue — [GOLD] = "Verify selected".
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { prisma, type PaymentMethod } from "@/server/repo/client";
import { listVerifyQueue, type VerifyQueueFilters } from "@/server/repo/payments";
import { Money } from "@/components/app/Money";
import { VerifyQueue } from "./VerifyQueue";

const METHODS: PaymentMethod[] = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE", "CARD"];
type SearchParams = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function VerifyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const t = await getTranslations("payments");
  const tm = await getTranslations("recordPayment.methods");

  const method = one(sp.method);
  const filters: VerifyQueueFilters = {
    receivedInto: one(sp.into),
    method: METHODS.includes(method as PaymentMethod) ? (method as PaymentMethod) : undefined,
    salespersonId: one(sp.sp),
  };

  const [queue, accounts, staff] = await Promise.all([
    listVerifyQueue({ tenantId: session.tenantId, filters }),
    prisma.account.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    }),
    prisma.user.findMany({
      where: { tenantId: session.tenantId, active: true, OR: [{ role: "SALES" }, { canReceivePayments: true }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, canReceivePayments: true },
    }),
  ]);

  const selectClass =
    "h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-sm";

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("verifyTitle")}</h1>
        <p className="text-sm text-[color:var(--color-ink-2)]">
          {t("waiting", { count: queue.count })} · <Money value={queue.total} />
        </p>
      </header>

      <form className="mb-5 flex flex-wrap items-end gap-3" action="/payments" method="GET">
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("filterInto")}</span>
          <select name="into" defaultValue={filters.receivedInto ?? ""} className={selectClass}>
            <option value="">{t("any")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={`account:${a.id}`}>
                {a.label}
              </option>
            ))}
            {staff
              .filter((u) => u.canReceivePayments)
              .map((u) => (
                <option key={u.id} value={`user:${u.id}`}>
                  {t("personal", { name: u.name })}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("filterMethod")}</span>
          <select name="method" defaultValue={filters.method ?? ""} className={selectClass}>
            <option value="">{t("any")}</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {tm(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="label-caps">{t("filterSalesperson")}</span>
          <select name="sp" defaultValue={filters.salespersonId ?? ""} className={selectClass}>
            <option value="">{t("any")}</option>
            {staff
              .filter((u) => u.role === "SALES")
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-4 text-sm hover:bg-[color:var(--color-surface-2)]"
        >
          {t("apply")}
        </button>
      </form>

      <VerifyQueue
        rows={queue.rows.map((r) => ({
          ...r,
          paidOn: r.paidOn.toISOString(),
          createdAt: r.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
