import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan, can } from "@/server/auth/permissions";
import { listCustomers } from "@/server/repo/customers";
import { Badge } from "@/components/ui/badge";

export default async function CustomersPage() {
  const session = await requireSession();
  try {
    assertCan(session.role, "customers.manage", { isOwn: true });
  } catch {
    redirect("/home");
  }
  const t = await getTranslations("customers");
  const canCreate = can(session.role, "customers.manage", { isOwn: true });

  const customers = await listCustomers(session.tenantId, { limit: 200 });

  return (
    <div className="px-6 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canCreate && (
          <Link
            href="/customers/new"
            data-gold
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-5 text-sm font-medium"
          >
            {t("newCustomer")}
          </Link>
        )}
      </header>

      {customers.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]">{t("empty")}</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <tr>
                <th className="px-4 py-3">{t("colName")}</th>
                <th className="px-4 py-3">{t("colBusiness")}</th>
                <th className="px-4 py-3">{t("colPhone")}</th>
                <th className="px-4 py-3">{t("colType")}</th>
                <th className="px-4 py-3">{t("colCity")}</th>
                <th className="px-4 py-3 text-right">{t("colOrders")}</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/customers/${c.id}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[color:var(--color-ink-2)]">
                    {c.businessName ?? "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{c.phoneE164}</td>
                  <td className="px-4 py-3">
                    <Badge tone="neutral">{c.type.replace("_", " ")}</Badge>
                  </td>
                  <td className="px-4 py-3">{c.city ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.ordersCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
