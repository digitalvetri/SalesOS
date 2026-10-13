import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, Phone, Users } from "lucide-react";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import {
  salesLeaderboard,
  salespersonMonthlyHistory,
} from "@/server/services/dashboardService";
import { resolvePeriod } from "@/server/domain/dashboard/period";
import { Money } from "@/components/app/Money";
import { MonthlyHistoryPanel } from "@/components/app/MonthlyHistoryPanel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EmailField } from "./_components/EmailField";
import { PasswordField } from "./_components/PasswordField";

export default async function EmployeesPage() {
  const session = await requireSession();
  if (!can(session.role, "admin.dashboard")) redirect("/home");
  // ACCOUNTS can view the team but not manage logins.
  const canManage = can(session.role, "users.manage");
  const canSetTargets = can(session.role, "targets.set");

  const now = new Date();
  const period = resolvePeriod("this_month", now);

  const [users, leaderboard, history] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: session.tenantId, role: "SALES" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        phoneE164: true,
        role: true,
        active: true,
        canReceivePayments: true,
        lastLoginAt: true,
      },
    }),
    salesLeaderboard({ tenantId: session.tenantId }, period),
    salespersonMonthlyHistory({ tenantId: session.tenantId }, { months: 6 }, now),
  ]);

  const perfBy = new Map(leaderboard.map((r) => [r.userId, r]));
  const histBy = new Map(history.salespersons.map((r) => [r.userId, r]));

  // Split into active vs archived for a clearer page.
  const activeUsers = users.filter((u) => u.active);
  const archivedUsers = users.filter((u) => !u.active);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-6 xl:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Employees</h1>
          <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
            Live performance across the team. Tap a name for their details and history.
          </p>
        </div>
        {canManage && (
          <Link
            href="/settings/users/new"
            data-gold
            className="inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold"
          >
            + Add employee
          </Link>
        )}
      </header>

      {activeUsers.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-10 text-center">
          <Users className="mx-auto h-6 w-6 text-[color:var(--color-ink-3)]" />
          <p className="mt-3 text-sm text-[color:var(--color-ink-2)]">No employees yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeUsers.map((u) => {
            const perf = u.role === "SALES" ? perfBy.get(u.id) : null;
            const h = u.role === "SALES" ? histBy.get(u.id) : null;
            return (
              <article
                key={u.id}
                className="surface-card flex min-w-0 flex-col gap-4 p-4 sm:p-5"
              >
                <header className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold">
                        <Link href={`/employees/${u.id}`} className="hover:text-[color:var(--color-gold)] hover:underline">
                          {u.name}
                        </Link>
                      </h2>
                      <Badge tone="neutral">{u.role}</Badge>
                    </div>
                    {canManage ? (
                      <EmailField userId={u.id} email={u.email} />
                    ) : (
                      u.email && <ContactLine icon={<Mail className="h-3.5 w-3.5" />}>{u.email}</ContactLine>
                    )}
                    <ContactLine icon={<Phone className="h-3.5 w-3.5" />}>
                      {u.phoneE164}
                    </ContactLine>
                  </div>
                  <Link
                    href={`/orders?sp=${u.id}`}
                    className="text-xs text-[color:var(--color-ink-2)] hover:underline"
                  >
                    View orders ›
                  </Link>
                </header>

                {canManage && (
                  <div className="border-t border-[color:var(--color-border)] pt-3">
                    <PasswordField userId={u.id} />
                  </div>
                )}

                {perf ? (
                  <div className="grid grid-cols-3 gap-2 border-t border-[color:var(--color-border)] pt-3">
                    <Stat label="Booked this month" value={<Money value={perf.booked} />} />
                    <Stat label="Orders" value={<span className="tabular-nums">{perf.orders}</span>} />
                    <Stat
                      label="% of target"
                      value={
                        perf.pct === null ? (
                          <span className="text-xs font-normal text-[color:var(--color-ink-3)]">
                            No target set
                            {canSetTargets && (
                              <>
                                {" · "}
                                <Link
                                  href={`/employees/${u.id}`}
                                  className="font-medium text-[color:var(--color-gold)] hover:underline"
                                >
                                  Set
                                </Link>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="tabular-nums">{perf.pct}%</span>
                        )
                      }
                    />
                  </div>
                ) : (
                  <p className="border-t border-[color:var(--color-border)] pt-3 text-xs text-[color:var(--color-ink-3)]">
                    No sales performance tracked for this role.
                  </p>
                )}

                {h && (
                  <div className="border-t border-[color:var(--color-border)] pt-3">
                    <div className="label-caps mb-2">Last 6 months — completed orders, by order month</div>
                    <MonthlyHistoryPanel
                      months={history.months}
                      salespersons={[h]}
                      singleUser
                    />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {archivedUsers.length > 0 && (
        <section className="mt-10">
          <h2 className="label-caps mb-3">Archived</h2>
          <ul className="divide-y divide-[color:var(--color-border)] rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
            {archivedUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between px-4 py-3 text-sm text-[color:var(--color-ink-3)]"
              >
                <span>
                  {u.name} <span className="text-xs">· {u.role}</span>
                </span>
                <span className="text-xs">{u.email ?? u.phoneE164}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label-caps">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function ContactLine({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mt-1 flex items-center gap-1.5 text-xs text-[color:var(--color-ink-3)]",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="truncate">{children}</span>
    </div>
  );
}
