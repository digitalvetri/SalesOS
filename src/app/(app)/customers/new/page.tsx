import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { NewCustomerForm } from "./NewCustomerForm";

export default async function NewCustomerPage() {
  const session = await requireSession();
  try {
    assertCan(session.role, "customers.manage", { isOwn: true });
  } catch {
    redirect("/home");
  }
  const t = await getTranslations("customers");

  return (
    <div className="px-6 py-6">
      <div className="mb-4">
        <Link href="/customers" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          ← {t("backToList")}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("newTitle")}</h1>
      <NewCustomerForm />
    </div>
  );
}
