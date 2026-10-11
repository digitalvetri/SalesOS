// §11.8 sub-tab "Cash with staff": per person, undeposited amounts → "Mark deposited".
// [GOLD] = the total-with-staff figure (the number this tab exists to drive to zero).
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Decimal from "decimal.js";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/repo/client";
import { listCashWithStaff } from "@/server/repo/payments";
import { istDateString } from "@/server/domain/payment/record";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { DepositSheet } from "./DepositSheet";

export default async function CashWithStaffPage() {
  const session = await requireSession();
  const t = await getTranslations("payments");
  const tm = await getTranslations("recordPayment.methods");

  const [groups, accounts] = await Promise.all([
    listCashWithStaff(session.tenantId),
    prisma.account.findMany({
      where: { tenantId: session.tenantId, active: true },
      orderBy: { label: "asc" },
      select: { id: true, label: true, entityId: true },
    }),
  ]);
  const grand = groups.reduce((s, g) => s.plus(g.total), new Decimal(0));
  const count = groups.reduce((n, g) => n + g.payments.length, 0);
  const today = istDateString(new Date());

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("cashTitle")}</h1>
        <div className="mt-2 flex items-baseline gap-3">
          <span data-gold="true" className="rounded-[var(--radius)] px-2 py-0.5">
            <Money value={grand.toString()} size="xl" />
          </span>
          <span className="text-sm text-[color:var(--color-ink-2)]">
            {t("cashSummary", { count, people: groups.length })}
          </span>
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="py-12 text-center text-base text-[color:var(--color-ink-2)]">{t("emptyCash")}</p>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section
              key={g.user.id}
              className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
              data-testid="cash-group"
            >
              <header className="flex items-baseline justify-between bg-[color:var(--color-surface-2)] px-4 py-2">
                <h2 className="font-medium">{g.user.name}</h2>
                <Money value={g.total} />
              </header>
              <ul className="divide-y divide-[color:var(--color-border)]">
                {g.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{p.receiptNo}</span>
                        <Badge tone={p.status === "VERIFIED" ? "ok" : "info"}>
                          {t(`statusShort.${p.status}`)}
                        </Badge>
                      </div>
                      <div className="text-xs text-[color:var(--color-ink-3)]">
                        <Link href={`/orders/${p.order.id}`} className="hover:underline">
                          {p.order.number}
                        </Link>{" "}
                        · {tm(p.method)} ·{" "}
                        {p.paidOn.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Money value={p.amount} />
                      <DepositSheet
                        paymentId={p.id}
                        receiptNo={p.receiptNo}
                        amount={p.amount}
                        holder={g.user.name}
                        today={today}
                        accounts={[...accounts].sort(
                          (a, b) => Number(b.entityId === p.order.entityId) - Number(a.entityId === p.order.entityId),
                        )}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
