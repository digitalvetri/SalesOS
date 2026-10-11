import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { listEntities } from "@/server/repo/entities";
import { EntityForm } from "./EntityForm";

export default async function EntitiesPage() {
  const session = await requireSession();
  const entities = await listEntities(session.tenantId);
  const t = await getTranslations("settings.entities");

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <div className="grid gap-6 lg:grid-cols-2">
        {entities.map((entity, idx) => (
          <EntityForm
            key={entity.id}
            gold={idx === 0}
            entity={{
              id: entity.id,
              code: entity.code,
              name: entity.name,
              gstin: entity.gstin,
              address: entity.address,
              phone: entity.phone,
              active: entity.active,
              accountCount: entity._count.accounts,
            }}
          />
        ))}
      </div>
    </section>
  );
}
