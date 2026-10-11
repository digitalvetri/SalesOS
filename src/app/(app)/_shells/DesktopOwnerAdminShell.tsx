import { getTranslations } from "next-intl/server";
import {
  LayoutDashboard,
  List,
  IndianRupee,
  Users,
  Package,
  Tag,
  BarChart3,
  Settings,
  Home,
} from "lucide-react";
import { TopBar } from "./TopBar";
import { DesktopSidebar } from "./DesktopSidebar";
import type { SessionUser } from "@/server/repo/users";

export async function DesktopOwnerAdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  const items = [
    { label: t("common.home"), icon: <Home className="h-4 w-4" />, href: "/home" },
    { label: t("common.dashboard"), icon: <LayoutDashboard className="h-4 w-4" />, disabled: true },
    { label: t("common.orders"), icon: <List className="h-4 w-4" />, href: "/orders" },
    { label: t("common.payments"), icon: <IndianRupee className="h-4 w-4" />, href: "/payments" },
    { label: t("common.collect"), icon: <IndianRupee className="h-4 w-4" />, href: "/collect" },
    { label: t("common.dispatch"), icon: <Package className="h-4 w-4" />, disabled: true },
    { label: t("common.customers"), icon: <Users className="h-4 w-4" />, href: "/customers" },
    { label: t("common.priceList"), icon: <Tag className="h-4 w-4" />, href: "/catalogue" },
    { label: t("common.reports"), icon: <BarChart3 className="h-4 w-4" />, disabled: true },
    { label: t("common.settings"), icon: <Settings className="h-4 w-4" />, href: "/settings" },
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
