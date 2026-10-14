import { getTranslations } from "next-intl/server";
import { LayoutDashboard, List, UserSquare2, Tag, Settings, Factory, Wrench } from "lucide-react";
import { AppShell } from "./AppShell";
import type { SessionUser } from "@/server/repo/users";

export async function DesktopOwnerAdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  // v1.1 nav: Overview, Orders, Employees, Price List, Settings.
  // Removed per spec §1.1: Payments, Collect, Dispatch, Customers, Reports.
  // Price List kept per owner exception (see memory v1-1-spec-and-price-list-exception.md).
  const items = [
    { label: t("common.overview"), icon: <LayoutDashboard className="h-5 w-5" />, href: "/dashboard" },
    { label: t("common.orders"), icon: <List className="h-5 w-5" />, href: "/orders" },
    { label: "Production", icon: <Factory className="h-5 w-5" />, href: "/production" },
    { label: "Service", icon: <Wrench className="h-5 w-5" />, href: "/service" },
    { label: t("common.employees"), icon: <UserSquare2 className="h-5 w-5" />, href: "/employees" },
    { label: t("common.priceList"), icon: <Tag className="h-5 w-5" />, href: "/catalogue" },
    { label: t("common.settings"), icon: <Settings className="h-5 w-5" />, href: "/settings" },
  ];
  return (
    <AppShell user={user} items={items}>
      {children}
    </AppShell>
  );
}
