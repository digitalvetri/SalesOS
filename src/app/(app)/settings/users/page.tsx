import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listUsers } from "@/server/repo/users";
import { listEntities } from "@/server/repo/entities";
import { UserRow } from "./_components/UserRow";
import { Badge } from "@/components/ui/badge";
import type { Role } from "@/server/repo/client";

const ROLE_TONE: Record<Role, React.ComponentProps<typeof Badge>["tone"]> = {
  OWNER: "info",
  ADMIN: "info",
  ACCOUNTS: "neutral",
  SALES: "ok",
  DISPATCH: "neutral",
};

export default async function UsersPage() {
  const session = await requireSession();
  const [users, entities] = await Promise.all([
    listUsers(session.tenantId),
    listEntities(session.tenantId),
  ]);
  const entityMap = new Map(entities.map((e) => [e.id, e.code]));
  const t = await getTranslations("settings.users");

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t("listTitle")}</h2>
        <Link
          href="/settings/users/new"
          data-gold
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] px-5 text-sm font-medium"
        >
          {t("newUser")}
        </Link>
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
            <tr>
              <th className="px-4 py-3">{t("colName")}</th>
              <th className="px-4 py-3">{t("colPhone")}</th>
              <th className="px-4 py-3">{t("colRole")}</th>
              <th className="px-4 py-3">{t("colLang")}</th>
              <th className="px-4 py-3">{t("colEntity")}</th>
              <th className="px-4 py-3">{t("colActive")}</th>
              <th className="px-4 py-3 text-right">{t("colActions")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-[color:var(--color-border)] align-middle"
              >
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 tabular-nums">{u.phoneE164}</td>
                <td className="px-4 py-3">
                  <Badge tone={ROLE_TONE[u.role]}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3 uppercase">{u.lang}</td>
                <td className="px-4 py-3">{u.defaultEntityId ? entityMap.get(u.defaultEntityId) ?? "—" : "—"}</td>
                <td className="px-4 py-3">{u.active ? "✓" : "—"}</td>
                <td className="px-4 py-3 text-right">
                  <UserRow user={u} isSelf={u.id === session.userId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
