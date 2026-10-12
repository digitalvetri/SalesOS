import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { prisma } from "@/server/repo/client";
import { DefaultTargetEditor } from "./_components/DefaultTargetEditor";
import { ChangeMyPassword } from "./_components/ChangeMyPassword";

export default async function SettingsPage() {
  const session = await requireSession();
  if (!can(session.role, "settings.manage")) redirect("/home");

  const [tenant, settings] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: { name: true },
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId: session.tenantId },
      select: { defaultMonthlyTarget: true },
    }),
  ]);

  return (
    <div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Company">
          <dl className="space-y-3 text-sm">
            <Row label="Name">{tenant?.name ?? "—"}</Row>
          </dl>
        </Card>

        <Card title="Default monthly target">
          <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
            Used for any employee whose current month doesn&apos;t have a
            specific target set. Set 0 to opt out of fallback targets.
          </p>
          <DefaultTargetEditor
            initial={settings?.defaultMonthlyTarget.toString() ?? "0"}
          />
        </Card>

        <Card title="Billing entities (KI / KFM)">
          <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
            The entities new orders bill from.
          </p>
          <Link
            href="/settings/entities"
            className="text-sm text-[color:var(--color-ink-2)] hover:underline"
          >
            Manage entities ›
          </Link>
        </Card>

        <Card title="Users">
          <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
            Add, deactivate, or reset passwords for the team.
          </p>
          <Link
            href="/settings/users"
            className="text-sm text-[color:var(--color-ink-2)] hover:underline"
          >
            Open user list ›
          </Link>
        </Card>

        <Card title="Change my password">
          <ChangeMyPassword />
        </Card>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-1)]">
      <h2 className="label-caps mb-3">{title}</h2>
      {children}
    </section>
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
