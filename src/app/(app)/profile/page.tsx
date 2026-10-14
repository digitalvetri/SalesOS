// My profile — every user: name, mobile and password. The login email is set by an admin.
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/repo/client";
import { ProfileForm } from "./_components/ProfileForm";
import { ChangeMyPassword } from "../settings/_components/ChangeMyPassword";
import { InstallApp } from "@/components/app/InstallApp";

export default async function ProfilePage() {
  const session = await requireSession();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { name: true, username: true, email: true, phoneE164: true, role: true, defaultEntityId: true },
  });
  const entity = me.defaultEntityId
    ? await prisma.billingEntity.findUnique({ where: { id: me.defaultEntityId }, select: { code: true } })
    : null;
  const roleLabel = { OWNER: "Owner", ADMIN: "Admin", ACCOUNTS: "Accounts", SALES: "Sales", DISPATCH: "Dispatch", PRODUCTION: "Production" }[me.role];

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6 md:px-6">
      <header className="mb-6 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-xl font-bold text-white">
          {me.name.trim().slice(0, 1).toUpperCase() || "·"}
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
          <p className="text-sm text-[color:var(--color-ink-3)]">{roleLabel}{entity ? ` · ${entity.code}` : ""}</p>
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold">Your details</h2>
          <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
            You sign in as <span className="font-semibold text-[color:var(--color-ink-2)]">{me.username ?? me.email ?? "—"}</span> — ask your admin to change it.
          </p>
          <ProfileForm name={me.name} phone={me.phoneE164.replace(/^\+91/, "")} />
        </section>
        <section className="surface-card p-5">
          <h2 className="mb-1 text-base font-semibold">Change password</h2>
          <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">Pick a new password only you know.</p>
          <ChangeMyPassword />
        </section>
        <section id="install" className="surface-card p-5 md:col-span-2">
          <h2 className="mb-1 text-base font-semibold">Install the app</h2>
          <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
            Put the KFM app on your phone or computer like a normal app — opens full screen from its own icon.
          </p>
          <InstallApp />
        </section>
      </div>
    </div>
  );
}
