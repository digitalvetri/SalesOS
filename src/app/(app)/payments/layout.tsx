import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { can } from "@/server/auth/permissions";
import { Tabs } from "@/components/app/Tabs";

// §11.0: Payments (Verify, Cash with staff) — Owner, Admin, Accounts.
export default async function PaymentsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!can(session.role, "payments.verify")) redirect("/home");
  const t = await getTranslations("payments");
  return (
    <div className="px-4 py-6 md:px-6">
      <Tabs
        label={t("title")}
        tabs={[
          { href: "/payments", label: t("tabVerify"), exact: true },
          { href: "/payments/cash", label: t("tabCash") },
          { href: "/payments/collected", label: t("tabCollected") },
        ]}
      />
      {children}
    </div>
  );
}
