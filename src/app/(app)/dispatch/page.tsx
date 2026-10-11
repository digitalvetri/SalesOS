// §11.10 Dispatch board — Owner, Admin, Dispatch.
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { getDispatchBoard } from "@/server/repo/dispatchBoard";
import { DispatchBoard } from "./DispatchBoard";
import { getWaConfig } from "@/server/services/whatsappService";

export default async function DispatchPage() {
  const session = await requireSession();
  if (!can(session.role, "dispatch.updateStatus")) redirect("/home");
  const t = await getTranslations("dispatch");
  const board = await getDispatchBoard({ tenantId: session.tenantId });
  return (
    <div className="px-4 py-6 md:px-6">
      <header className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {board.stuckCount > 0 && (
          <span className="text-sm text-[color:var(--color-danger)]">{t("stuckCount", { count: board.stuckCount })}</span>
        )}
      </header>
      <DispatchBoard columns={board.columns} today={board.today} apiConfigured={(await getWaConfig(session.tenantId)).configured} />
    </div>
  );
}
