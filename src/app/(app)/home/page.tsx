import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Decimal from "decimal.js";
import { Plus } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { Money } from "@/components/app/Money";
import { formatInr } from "@/lib/formatInr";
import { employeeOverview } from "@/server/services/employeeOverviewService";
import { TargetRing } from "./_components/TargetRing";
import { MonthBarChart } from "./_components/MonthBarChart";

const STATUS_PILL: Record<"PENDING" | "COMPLETED" | "CANCELLED", string> = {
  PENDING: "bg-[color:var(--color-warn-bg)] text-[color:var(--color-warn)]",
  COMPLETED: "bg-[color:var(--color-ok-bg)] text-[color:var(--color-ok)]",
  CANCELLED: "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-3)]",
};

export default async function HomePage() {
  const session = await requireSession();

  // v1.1 §4.1 — Employee app = Overview + Orders. Owner/Admin bounce to
  // /dashboard; Accounts collapsed into admin app (also /dashboard).
  if (session.role === "OWNER" || session.role === "ADMIN" || session.role === "ACCOUNTS") {
    redirect("/dashboard");
  }
  return <EmployeeHome session={session} />;
}

async function EmployeeHome({
  session,
}: {
  session: Awaited<ReturnType<typeof requireSession>>;
}) {
  const now = new Date();
  const t = await getTranslations("salesHome");
  const greeting = greetingByHour(now);
  const o = await employeeOverview({
    tenantId: session.tenantId,
    userId: session.userId,
    now,
  });

  return (
    <div className="flex flex-col gap-5 px-4 py-5 pb-24 md:px-6 md:pb-6">
      {/* Greeting + New order */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[color:var(--color-ink-3)]">
            {t(`greeting.${greeting}`)}, {session.user.name.split(" ")[0]}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {o.monthLabel} overview
          </h1>
        </div>
        <Link
          href="/orders?new=1"
          data-gold
          className="hidden h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-5 text-sm font-semibold md:inline-flex"
        >
          <Plus className="h-4 w-4" />
          New order
        </Link>
      </header>

      {/* Target ring + this-month tiles */}
      <section className="grid gap-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
          <div className="label-caps mb-2">{o.monthLabel.toUpperCase()} TARGET</div>
          <TargetRing
            achieved={o.achieved}
            target={o.target}
            pct={o.achievedPct}
            monthLabel={o.monthLabel}
            daysLeft={o.daysLeft}
            amountToTarget={o.amountToReachTarget}
            targetSource={o.targetSource}
          />
        </div>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <CountTile label="Orders" value={o.counts.orders} />
            <CountTile label="Completed" value={o.counts.completed} tone="ok" />
            <CountTile label="Pending" value={o.counts.pending} tone="warn" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <MoneyTile
              label="Payment received"
              amount={o.paymentReceived}
              hint={`in ${o.monthLabel}`}
              href={`/orders?m=${o.monthYm}`}
            />
            <MoneyTile
              label="Balance to collect"
              amount={o.balanceToCollect.amount}
              hint={`${o.balanceToCollect.orderCount} ${
                o.balanceToCollect.orderCount === 1 ? "order" : "orders"
              }`}
              href="/orders?f=balance_due"
              tone="warn"
            />
          </div>
        </div>
      </section>

      {/* 6-month chart */}
      <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
        <h2 className="label-caps mb-4">Last 6 months — achieved vs target</h2>
        <MonthBarChart rows={o.lastSixMonths} target={o.target} />
        <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
          Click a bar to open that month in the orders sheet.
        </p>
      </section>

      {/* Recent orders */}
      <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-[var(--shadow-1)]">
        <header className="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-3">
          <h2 className="label-caps">Recent orders</h2>
          <Link
            href="/orders"
            className="text-xs text-[color:var(--color-ink-2)] hover:underline"
          >
            See all orders ›
          </Link>
        </header>
        {o.recentOrders.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[color:var(--color-ink-3)]">
            No orders yet. Click <strong>+ New order</strong> on the Orders page to add one.
          </p>
        ) : (
          <ul>
            {o.recentOrders.map((r) => {
              const balance = new Decimal(r.balanceDue);
              return (
                <li
                  key={r.id}
                  className="border-t border-[color:var(--color-border)] first:border-t-0"
                >
                  <div className="flex items-start justify-between gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs tabular-nums text-[color:var(--color-ink-3)]">
                          #{r.serialNo ?? "—"}
                        </span>
                        <span className="font-medium truncate">
                          {r.customerName}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_PILL[r.simpleStatus]}`}
                        >
                          {r.simpleStatus.toLowerCase()}
                        </span>
                      </div>
                      {r.productText && (
                        <div className="mt-0.5 truncate text-xs text-[color:var(--color-ink-2)]">
                          {r.productText}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <Money value={r.total} />
                      <div className="text-[11px] text-[color:var(--color-ink-3)]">
                        {balance.isZero() ? (
                          "paid"
                        ) : (
                          <>Bal {formatInr(balance.toString())}</>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Mobile sticky "+ New order" (desktop uses the header button above) */}
      <div className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-sm md:hidden">
        <Link
          href="/orders?new=1"
          data-gold
          className="flex h-12 items-center justify-center gap-2 rounded-[var(--radius)] text-base font-semibold shadow-[var(--shadow-2)]"
        >
          <Plus className="h-4 w-4" />
          New order
        </Link>
      </div>
    </div>
  );
}

function CountTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const toneCls =
    tone === "ok"
      ? "text-[color:var(--color-ok)]"
      : tone === "warn"
        ? "text-[color:var(--color-warn)]"
        : "text-[color:var(--color-ink)]";
  return (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-1)]">
      <div className="label-caps">{label}</div>
      <div className={`mt-1 text-3xl font-bold tabular-nums tracking-tight ${toneCls}`}>
        {value}
      </div>
    </div>
  );
}

function MoneyTile({
  label,
  amount,
  hint,
  href,
  tone,
}: {
  label: string;
  amount: string;
  hint: string;
  href: string;
  tone?: "warn";
}) {
  return (
    <Link
      href={href}
      className="group block rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-1)] hover:bg-[color:var(--color-surface-2)]"
    >
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <span className="text-xs text-[color:var(--color-ink-3)] group-hover:text-[color:var(--color-ink)]">
          ›
        </span>
      </div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${
          tone === "warn" ? "text-[color:var(--color-warn)]" : ""
        }`}
      >
        {formatInr(amount)}
      </div>
      <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">{hint}</div>
    </Link>
  );
}

function greetingByHour(d: Date): "morning" | "afternoon" | "evening" {
  const istHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "numeric",
      hour12: false,
    })
      .formatToParts(d)
      .find((p) => p.type === "hour")!.value,
  );
  if (istHour < 12) return "morning";
  if (istHour < 17) return "afternoon";
  return "evening";
}
