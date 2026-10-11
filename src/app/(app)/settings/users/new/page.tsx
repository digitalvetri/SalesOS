import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listEntities } from "@/server/repo/entities";
import { CreateUserForm } from "./CreateUserForm";

export default async function NewUserPage() {
  const session = await requireSession();
  const entities = await listEntities(session.tenantId);
  const t = await getTranslations("settings.users");

  return (
    <section className="max-w-xl">
      <div className="mb-4">
        <Link href="/settings/users" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          ← {t("backToList")}
        </Link>
      </div>
      <h2 className="mb-6 text-lg font-semibold">{t("createTitle")}</h2>
      <CreateUserForm
        canCreateOwner={session.role === "OWNER"}
        entities={entities.map((e) => ({ id: e.id, code: e.code, name: e.name }))}
      />
    </section>
  );
}
