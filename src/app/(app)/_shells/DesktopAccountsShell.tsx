import { getTranslations } from "next-intl/server";
import { LayoutDashboard, List, UserSquare2, Tag } from "lucide-react";
import { AppShell } from "./AppShell";
import type { SessionUser } from "@/server/repo/users";

export async function DesktopAccountsShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  // v1.1 collapsed Accounts to the admin surface — no separate Payments page.
  // Payment entries live inside each order (added via the order detail).
  // No Settings item: Accounts is redirected away from /settings.
  const items = [
    { label: t("common.overview"), icon: <LayoutDashboard className="h-5 w-5" />, href: "/dashboard" },
    { label: t("common.orders"), icon: <List className="h-5 w-5" />, href: "/orders" },
    { label: t("common.employees"), icon: <UserSquare2 className="h-5 w-5" />, href: "/employees" },
    { label: t("common.priceList"), icon: <Tag className="h-5 w-5" />, href: "/catalogue" },
  ];
  return (
    <AppShell user={user} items={items}>
      {children}
    </AppShell>
  );
}
