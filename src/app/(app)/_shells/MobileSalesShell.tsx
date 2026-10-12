import { getTranslations } from "next-intl/server";
import { LayoutDashboard, List } from "lucide-react";
import { AppShell } from "./AppShell";
import type { SessionUser } from "@/server/repo/users";

export async function MobileSalesShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  // v1.1 §4.1 — Employee nav is just Overview + Orders.
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
