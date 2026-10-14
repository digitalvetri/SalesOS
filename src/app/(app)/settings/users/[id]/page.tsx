import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { listEntities } from "@/server/repo/entities";
import { getUserForEdit } from "@/server/services/userService";
import { EditUserForm } from "./EditUserForm";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const [user, entities] = await Promise.all([
    getUserForEdit(session.tenantId, id).catch(() => null),
    listEntities(session.tenantId),
  ]);
  if (!user) notFound();
  // Only an Owner may edit an Owner's details (login, role).
  const locked = user.role === "OWNER" && session.role !== "OWNER";

  return (
    <section className="max-w-xl">
      <div className="mb-4">
        <Link href="/settings/users" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          ← Back to users
        </Link>
      </div>
      <h2 className="mb-1 text-lg font-semibold">Edit {user.name}</h2>
      <p className="mb-6 text-sm text-[color:var(--color-ink-3)]">
        Change the name, username, mobile, role or password. They sign in with the username below.
      </p>
      <EditUserForm
        user={{ ...user, username: user.username ?? "", email: user.email ?? "", phone: user.phoneE164.replace(/^\+91/, "") }}
        canSetOwner={session.role === "OWNER"}
        locked={locked}
        isSelf={user.id === session.userId}
        entities={entities.map((e) => ({ id: e.id, code: e.code, name: e.name }))}
      />
    </section>
  );
}
