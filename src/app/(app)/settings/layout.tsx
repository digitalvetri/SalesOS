import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { getTranslations } from "next-intl/server";
import { Tabs } from "@/components/app/Tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  // Server-side gate: Settings is Owner/Admin only (§4.2 settings.manage).
  try {
    assertCan(session.role, "settings.manage");
  } catch {
    redirect("/home");
  }

  const t = await getTranslations("settings");

  const tabs = [
    { href: "/settings/users", label: t("tabs.users") },
    { href: "/settings/entities", label: t("tabs.entities") },
    { href: "/settings/accounts", label: t("tabs.accounts") },
    { href: "/settings/targets", label: t("tabs.targets") },
    { href: "/settings/whatsapp", label: t("tabs.whatsapp") },
  ];

  return (
    <div className="px-6 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </header>
      <Tabs tabs={tabs} />
      {children}
    </div>
  );
}
