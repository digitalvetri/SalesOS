import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan, can } from "@/server/auth/permissions";
import { getCustomerById, listCustomers } from "@/server/repo/customers";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { StatusPill, type AnyStatus } from "@/components/app/StatusPill";
import { MergeDialog } from "./MergeDialog";
import { realPhone } from "@/lib/orderDisplay";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();
  try {
    assertCan(session.role, "customers.manage", { isOwn: true });
  } catch {
    redirect("/home");
  }
  const t = await getTranslations("customers");
  const customer = await getCustomerById(session.tenantId, id);
  if (!customer || customer.mergedIntoId) notFound();

  const canMerge = can(session.role, "customers.manage") && (session.role === "OWNER" || session.role === "ADMIN");

  // Lightweight "other customers" list for the merge dialog.
  const otherCustomers = canMerge
    ? (await listCustomers(session.tenantId, { limit: 300 }))
        .filter((c) => c.id !== customer.id)
        .map((c) => ({ id: c.id, name: c.name, phoneE164: realPhone(c.phoneE164) }))
    : [];

  const totalBooked = customer.orders.reduce(
    (sum, o) => sum + Number(o.total),
    0,
  );
  const totalBalance = customer.orders.reduce(
    (sum, o) => sum + Number(o.balanceDue),
    0,
  );

  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <Link href="/customers" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          â {t("backToList")}
        </Link>
      </div>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {customer.businessName ?? customer.name}
          </h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
            {customer.businessName ? `${customer.name} Â· ` : ""}
            <span className="tabular-nums">{realPhone(customer.phoneE164) ?? "—"}</span>
            {customer.altPhone ? ` Â· ${customer.altPhone}` : ""}
            {customer.city ? ` Â· ${customer.city}` : ""}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge tone="neutral">{customer.type.replace("_", " ")}</Badge>
            {customer.gstin && (
              <span className="text-xs text-[color:var(--color-ink-3)]">
                GSTIN {customer.gstin}
              </span>
            )}
          </div>
          {customer.mergedFrom.length > 0 && (
            <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
              {t("mergedFromHint", { count: customer.mergedFrom.length })}
            </p>
          )}
        </div>
        {canMerge && otherCustomers.length > 0 && (
          <MergeDialog
            survivor={{
              id: customer.id,
              name: customer.name,
              phoneE164: realPhone(customer.phoneE164),
            }}
            others={otherCustomers}
          />
        )}
      </header>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <div className="label-caps">{t("lifetimeValue")}</div>
          <Money value={totalBooked} size="xl" />
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
            {customer.orders.length} {t("ordersTotal")}
          </p>
        </div>
        <div className="rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <div className="label-caps">{t("balanceDue")}</div>
          <Money value={totalBalance} size="xl" />
        </div>
      </div>

      <section className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <header className="bg-[color:var(--color-surface-2)] px-4 py-2">
          <h3 className="label-caps">{t("orders")}</h3>
        </header>
        {customer.orders.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[color:var(--color-ink-3)]">
            {t("noOrdersYet")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th className="px-4 py-2">{t("orderNumber")}</th>
                <th className="px-4 py-2">{t("orderDate")}</th>
                <th className="px-4 py-2 text-right">{t("orderTotal")}</th>
                <th className="px-4 py-2 text-right">{t("balance")}</th>
                <th className="px-4 py-2">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {customer.orders.map((o) => (
                <tr key={o.id} className="border-t border-[color:var(--color-border)]">
                  <td className="px-4 py-2 font-medium">{o.number}</td>
                  <td className="px-4 py-2 tabular-nums">
                    {o.orderDate.toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Money value={o.total.toString()} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Money value={o.balanceDue.toString()} />
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill status={o.status as AnyStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
