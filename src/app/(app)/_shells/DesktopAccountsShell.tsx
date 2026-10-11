import { getTranslations } from "next-intl/server";
import { LayoutDashboard, List, UserSquare2, Tag, Settings } from "lucide-react";
import { TopBar } from "./TopBar";
import { DesktopSidebar } from "./DesktopSidebar";
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
  const items = [
    { label: t("common.overview"), icon: <LayoutDashboard className="h-5 w-5" />, href: "/dashboard" },
    { label: t("common.orders"), icon: <List className="h-5 w-5" />, href: "/orders" },
    { label: t("common.employees"), icon: <UserSquare2 className="h-5 w-5" />, href: "/employees" },
    { label: t("common.priceList"), icon: <Tag className="h-5 w-5" />, href: "/catalogue" },
    { label: t("common.settings"), icon: <Settings className="h-5 w-5" />, href: "/settings" },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />
      <div className="flex flex-1">
        <DesktopSidebar items={items} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
