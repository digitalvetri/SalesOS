import { getTranslations } from "next-intl/server";
import { LayoutDashboard, List } from "lucide-react";
import { TopBar } from "./TopBar";
import { MobileNavItem } from "./MobileNavItem";
import { DesktopSidebar } from "./DesktopSidebar";
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
  const sidebarItems = [
    { label: t("common.overview"), icon: <LayoutDashboard className="h-5 w-5" />, href: "/home" },
    { label: t("common.orders"), icon: <List className="h-5 w-5" />, href: "/orders" },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />
      <div className="flex flex-1">
        <DesktopSidebar items={sidebarItems} />
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      </div>
      <nav
        role="navigation"
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-[color:var(--color-nav-border)] bg-[color:var(--color-nav-bg)] md:hidden"
      >
        <MobileNavItem href="/home" icon={<LayoutDashboard className="h-5 w-5" />} label={t("common.overview")} />
        <MobileNavItem href="/orders" icon={<List className="h-5 w-5" />} label={t("common.orders")} />
      </nav>
    </div>
  );
}
