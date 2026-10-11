import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { listEntities } from "@/server/repo/entities";
import { listAccounts } from "@/server/repo/accounts";
import { prisma } from "@/server/repo/client";
import { NewOrderWizard } from "./NewOrderWizard";

export default async function NewOrderPage() {
  const session = await requireSession();
  try {
    assertCan(session.role, "orders.create", { isOwn: true });
  } catch {
    redirect("/home");
  }
  const t = await getTranslations("orderWizard");

  const [entities, accounts, me] = await Promise.all([
    listEntities(session.tenantId),
    listAccounts(session.tenantId),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        defaultEntityId: true,
        canReceivePayments: true,
      },
    }),
  ]);

  // Only staff who can receive payments appear in the "received into — person" list.
  // The current actor is always first so the "me" option is one tap.
  const receiveStaff = await prisma.user.findMany({
    where: {
      tenantId: session.tenantId,
      active: true,
      canReceivePayments: true,
    },
    orderBy: [{ id: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col pb-20">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3">
        <Link
          href="/orders"
          className="text-sm text-[color:var(--color-ink-2)] hover:underline"
          aria-label={t("back")}
        >
          ←
        </Link>
        <h1 className="text-base font-semibold">{t("title")}</h1>
        <span className="w-6" aria-hidden />
      </header>

      <NewOrderWizard
        actor={{
          id: session.userId,
          name: me?.name ?? "",
          canReceivePayments: me?.canReceivePayments ?? false,
          defaultEntityId: me?.defaultEntityId ?? entities[0]?.id ?? "",
        }}
        entities={entities
          .filter((e) => e.active)
          .map((e) => ({ id: e.id, code: e.code, name: e.name }))}
        accounts={accounts
          .filter((a) => a.active)
          .map((a) => ({
            id: a.id,
            label: a.label,
            kind: a.kind,
            entityId: a.entityId,
            entityCode: a.entity.code,
          }))}
        receiveStaff={receiveStaff.map((u) => ({ id: u.id, name: u.name }))}
      />
    </div>
  );
}
