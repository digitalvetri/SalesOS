import type Decimal from "decimal.js";
import { prisma, type Prisma } from "./client";

// Shape visible to Sales — never includes dealer-price fields.
// (Snapshot-tested in tests/unit/catalogue-dto.test.ts.)
export const SALES_PRODUCT_SELECT = {
  id: true,
  name: true,
  spec: true,
  aliases: true,
  customerPrice: true,
  gstRate: true,
  isStockItem: true,
  active: true,
  categoryId: true,
} satisfies Prisma.ProductSelect;

export const ADMIN_PRODUCT_SELECT = {
  ...SALES_PRODUCT_SELECT,
  dealerPrice: true,
  dealerPriceWoMotor: true,
  searchText: true,
  updatedAt: true,
} satisfies Prisma.ProductSelect;

export async function listCategories(tenantId: string) {
  return prisma.productCategory.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sortOrder: true },
  });
}

export async function listProductsForAdmin(tenantId: string) {
  return prisma.product.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { categoryId: "asc" }, { name: "asc" }],
    select: ADMIN_PRODUCT_SELECT,
  });
}

export async function listProductsForSales(tenantId: string) {
  return prisma.product.findMany({
    where: { tenantId, active: true },
    orderBy: [{ categoryId: "asc" }, { name: "asc" }],
    select: SALES_PRODUCT_SELECT,
  });
}

export type ProductSearchHit = {
  id: string;
  name: string;
  spec: string | null;
  customerPrice: Decimal.Value | null;
  categoryId: string;
};

export async function searchProducts(opts: {
  tenantId: string;
  query: string;
  limit?: number;
}): Promise<ProductSearchHit[]> {
  const limit = opts.limit ?? 20;
  const q = opts.query.trim().toLowerCase();
  if (q.length === 0) return [];
  // pg_trgm similarity on searchText; also check alias array for exact substring.
  const rows = await prisma.$queryRaw<ProductSearchHit[]>`
    SELECT id, name, spec, "customerPrice", "categoryId"
      FROM "Product"
     WHERE "tenantId" = ${opts.tenantId}
       AND active = TRUE
       AND (
         "searchText" % ${q}
         OR "searchText" ILIKE ${"%" + q + "%"}
         OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE ${"%" + q + "%"})
       )
     ORDER BY similarity("searchText", ${q}) DESC
     LIMIT ${limit}
  `;
  return rows;
}

export async function getProductForAdmin(tenantId: string, id: string) {
  return prisma.product.findFirst({
    where: { tenantId, id },
    select: {
      ...ADMIN_PRODUCT_SELECT,
      category: { select: { id: true, name: true } },
      priceHistory: {
        orderBy: { changedAt: "desc" },
        take: 20,
        select: {
          id: true,
          dealerPrice: true,
          dealerPriceWoMotor: true,
          customerPrice: true,
          changedAt: true,
          changedById: true,
        },
      },
    },
  });
}
