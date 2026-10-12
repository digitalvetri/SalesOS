import { getTranslations } from "next-intl/server";
import { LayoutDashboard, List } from "lucide-react";
import { AppShell } from "./AppShell";
import type { SessionUser } from "@/server/repo/users";

// v1.1 removed the Dispatch board. DISPATCH-role users (if any remain)
// get the Employee shell: Overview + Orders. Their orders view lets them
// mark things completed.
export async function MobileDispatchShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  const items = [
    { label: t("common.overview"), icon: <LayoutDashboard className="h-5 w-5" />, href: "/home" },
    { label: t("common.orders"), icon: <List className="h-5 w-5" />, href: "/orders" },
  ];
  return (
    <AppShell user={user} items={items}>
      {children}
    </AppShell>
  );
}
