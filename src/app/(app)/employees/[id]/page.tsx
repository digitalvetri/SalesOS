import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { employeeDetail } from "@/server/services/employeeDetailService";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/app/Money";
import { TargetEditor } from "./_components/TargetEditor";
import { ResetPasswordButton } from "./_components/ResetPasswordButton";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  if (!can(session.role, "admin.dashboard")) redirect("/home");
  const { id } = await params;

  const d = await employeeDetail({ tenantId: session.tenantId, userId: id });
  if (!d) notFound();

  return (
    <div className="px-4 py-6 md:px-6">
      <Link
        href="/employees"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[color:var(--color-ink-2)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Employees
      </Link>

      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.user.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--color-ink-3)]">
            <Badge tone="neutral">{d.user.role}</Badge>
            <span>·</span>
            <span>{d.user.active ? "Active" : "Deactivated"}</span>
          </div>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        {/* Login details */}
        <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
          <h2 className="label-caps mb-3">Login details</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Login mobile">{d.user.phoneE164}</Row>
            <Row label="Email">{d.user.email ?? "—"}</Row>
            <Row label="Password">
              <span className="text-[color:var(--color-ink-3)]">
                ••••••••
                {d.user.passwordSetAt && (
                  <> · set {d.user.passwordSetAt.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</>
                )}
              </span>
            </Row>
            <Row label="Last login">
              {d.user.lastLoginAt
                ? d.user.lastLoginAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                : "Never"}
            </Row>
          </dl>
          <div className="mt-4">
            <ResetPasswordButton userId={d.user.id} name={d.user.name} phone={d.user.phoneE164} />
          </div>
        </section>

        {/* Target editor */}
        <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
          <h2 className="label-caps mb-3">Target</h2>
          <TargetEditor
            userId={d.user.id}
            currentMonthYm={d.currentMonthYm}
            nextMonthYm={d.nextMonthYm}
            currentTarget={d.currentTarget}
            nextTarget={d.nextTarget}
            defaultTarget={d.defaultTarget}
          />
        </section>
      </div>

      {/* Sales by month */}
      <section className="mt-5 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
        <h2 className="label-caps mb-1">Sales by month</h2>
        <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
          Orders are grouped by order date; payments by the date they were paid. Cancelled orders are left out.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <tr>
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 pr-3 text-right">Orders</th>
                <th className="py-2 pr-3 text-right">Booked</th>
                <th className="py-2 pr-3 text-right">Avg order</th>
                <th className="py-2 pr-3 text-right">Target</th>
                <th className="py-2 pr-3 text-right">%</th>
                <th className="py-2 pr-3 text-right" title="Orders booked that month that are now completed">Completed</th>
                <th className="py-2 pr-3 text-right">Payment received</th>
                <th className="py-2 text-right" title="Still to collect on orders booked that month">Balance</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.ym} className="border-t border-[color:var(--color-border)]">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/orders?m=${m.ym}&sp=${d.user.id}`}
                      className="font-medium hover:underline"
                    >
                      {m.label}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.orders}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <Money value={m.booked} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <Money value={m.avgOrder} />
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-[color:var(--color-ink-3)]">
                    {m.hasTarget ? <Money value={m.target} /> : <span className="text-xs">Not set</span>}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular-nums font-medium ${
                      m.pct === null
                        ? "text-[color:var(--color-ink-3)]"
                        : m.pct >= 100
                          ? "text-[color:var(--color-ok)]"
                          : m.pct >= 50
                            ? "text-[color:var(--color-ink)]"
                            : "text-[color:var(--color-ink-3)]"
                    }`}
                  >
                    {m.pct === null ? "—" : `${m.pct}%`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m.completed}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <Money value={m.paymentReceived} />
                  </td>
                  <td className="py-2 text-right tabular-nums text-[color:var(--color-warn)]">
                    <Money value={m.balance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[color:var(--color-ink-3)]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
