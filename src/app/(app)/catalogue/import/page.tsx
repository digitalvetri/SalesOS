import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan } from "@/server/auth/permissions";
import { ImportForm } from "./ImportForm";

export default async function CatalogueImportPage() {
  const session = await requireSession();
  try {
    assertCan(session.role, "priceList.edit");
  } catch {
    redirect("/home");
  }
  const t = await getTranslations("catalogue.import");

  return (
    <div className="px-6 py-6">
      <div className="mb-6">
        <Link href="/catalogue" className="text-sm text-[color:var(--color-ink-2)] hover:underline">
          ← {t("backToPriceList")}
        </Link>
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mb-6 max-w-2xl text-sm text-[color:var(--color-ink-2)]">
        {t("description")}
      </p>
      <ImportForm />
    </div>
  );
}
