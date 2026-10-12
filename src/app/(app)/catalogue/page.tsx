import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/server/auth/session";
import { assertCan, can, level } from "@/server/auth/permissions";
import { listCategories, listProductsForAdmin, listProductsForSales } from "@/server/repo/products";
import { PriceEditor } from "./_components/PriceEditor";
import { SalesPriceList } from "./_components/SalesPriceList";
import { NewProductButton } from "./_components/NewProductButton";
import { EmptyState } from "@/components/app/EmptyState";

export default async function CataloguePage() {
  const session = await requireSession();
  // Readable by Sales (customer price only), editable by Owner/Admin.
  try {
    assertCan(session.role, "orders.view"); // anyone who sees orders also sees catalogue
  } catch {
    redirect("/home");
  }
  const t = await getTranslations("catalogue");

  const canEdit = can(session.role, "priceList.edit");
  const canSeeDealer = can(session.role, "priceList.viewDealer");
  const salesReadOnly = level(session.role, "priceList.edit") === "readOnly";

  const [categories, products] = await Promise.all([
    listCategories(session.tenantId),
    canSeeDealer ? listProductsForAdmin(session.tenantId) : listProductsForSales(session.tenantId),
  ]);

  if (categories.length === 0) {
    return (
      <div className="px-6 py-6">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <EmptyState
          title={t("empty.needCategories")}
          action={
            canEdit ? (
              <div className="flex gap-2">
                <NewProductButton categories={categories} />
                <Link
                  href="/catalogue/import"
                  data-gold
                  className="inline-flex h-11 items-center justify-center rounded-[var(--radius)] px-5 text-sm font-medium"
                >
                  {t("importAction")}
                </Link>
              </div>
            ) : null
          }
        />
      </div>
    );
  }

  const productsSerialised = products.map((raw) => {
    const p = raw as typeof raw & {
      dealerPrice?: { toString(): string } | null;
      dealerPriceWoMotor?: { toString(): string } | null;
    };
    return {
      ...p,
      customerPrice: p.customerPrice ? p.customerPrice.toString() : null,
      ...(canSeeDealer
        ? {
            dealerPrice: p.dealerPrice ? p.dealerPrice.toString() : null,
            dealerPriceWoMotor: p.dealerPriceWoMotor ? p.dealerPriceWoMotor.toString() : null,
          }
        : {}),
      gstRate: p.gstRate ? p.gstRate.toString() : null,
    };
  });

  return (
    <div className="px-6 py-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        {canEdit && (
          <div className="flex items-center gap-2">
            <NewProductButton categories={categories} />
            <Link
              href="/catalogue/import"
              className="rounded-[var(--radius)] border border-[color:var(--color-border-strong)] px-4 py-2 text-sm hover:bg-[color:var(--color-surface-2)]"
            >
              {t("importAction")}
            </Link>
          </div>
        )}
      </header>

      {canEdit ? (
        <PriceEditor categories={categories} products={productsSerialised as never} />
      ) : (
        <SalesPriceList
          categories={categories}
          products={productsSerialised as never}
          readOnly={salesReadOnly}
        />
      )}
    </div>
  );
}
