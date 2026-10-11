import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listAccounts } from "@/server/repo/accounts";
import { listEntities } from "@/server/repo/entities";
import { NewAccountForm } from "./NewAccountForm";
import { AccountRow } from "./AccountRow";

export default async function AccountsPage() {
  const session = await requireSession();
  const [accounts, entities] = await Promise.all([
    listAccounts(session.tenantId),
    listEntities(session.tenantId),
  ]);
  const t = await getTranslations("settings.accounts");

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">{t("title")}</h2>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-surface-2)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
            <tr>
              <th className="px-4 py-3">{t("colEntity")}</th>
              <th className="px-4 py-3">{t("colLabel")}</th>
              <th className="px-4 py-3">{t("colKind")}</th>
              <th className="px-4 py-3">{t("colLast4")}</th>
              <th className="px-4 py-3">{t("colActive")}</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={{
                  id: a.id,
                  label: a.label,
                  kind: a.kind,
                  last4: a.last4,
                  active: a.active,
                  entityCode: a.entity.code,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <NewAccountForm entities={entities.map((e) => ({ id: e.id, code: e.code, name: e.name }))} />
    </section>
  );
}
