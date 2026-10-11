import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { EmptyState } from "@/components/app/EmptyState";
import type { Role } from "@/server/repo/client";

const BANNER_KEY: Record<Role, string> = {
  OWNER: "shell.roleBanner.owner",
  ADMIN: "shell.roleBanner.admin",
  ACCOUNTS: "shell.roleBanner.accounts",
  SALES: "shell.roleBanner.sales",
  DISPATCH: "shell.roleBanner.dispatch",
};

export default async function HomePage() {
  const session = await requireSession();
  const t = await getTranslations();
  return <EmptyState title={t(BANNER_KEY[session.role])} />;
}
