import Decimal from "decimal.js";
import { prisma, type Prisma } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";

// Rebuilds the searchText field used by pg_trgm. Lowercased, de-duplicated,
// space-separated: name + spec + aliases.
export function buildSearchText(opts: {
  name: string;
  spec: string | null | undefined;
  aliases: string[];
}): string {
  const parts = [opts.name, opts.spec ?? "", ...opts.aliases]
    .map((s) => s.toLowerCase().trim())
    .filter(Boolean);
  return Array.from(new Set(parts.join(" ").split(/\s+/))).join(" ");
}

export type CreateProductInput = {
  tenantId: string;
  actorId: string;
  categoryId: string;
  name: string;
  spec?: string | null;
  aliases?: string[];
  dealerPriceWoMotor?: Decimal.Value | null;
  dealerPrice?: Decimal.Value | null;
  customerPrice?: Decimal.Value | null;
  gstRate?: Decimal.Value | null;
  isStockItem?: boolean;
};

export async function createProduct(input: CreateProductInput) {
  const category = await prisma.productCategory.findFirst({
    where: { tenantId: input.tenantId, id: input.categoryId },
  });
  if (!category) throw new AppError("NOT_FOUND", "Category not found.");

  const aliases = input.aliases ?? [];
  const searchText = buildSearchText({ name: input.name, spec: input.spec, aliases });

  const row = await prisma.product.create({
    data: {
      tenantId: input.tenantId,
      categoryId: input.categoryId,
      name: input.name,
      spec: input.spec ?? null,
      aliases,
      searchText,
      dealerPriceWoMotor: toDecimalOrNull(input.dealerPriceWoMotor),
      dealerPrice: toDecimalOrNull(input.dealerPrice),
      customerPrice: toDecimalOrNull(input.customerPrice),
      gstRate: toDecimalOrNull(input.gstRate),
      isStockItem: input.isStockItem ?? false,
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "PRODUCT_CREATE",
    entity: "Product",
    entityId: row.id,
    after: {
      name: row.name,
      spec: row.spec,
      customerPrice: row.customerPrice?.toString(),
    },
  });

  return row;
}

export type UpdateProductInput = {
  tenantId: string;
  actorId: string;
  id: string;
  name?: string;
  spec?: string | null;
  aliases?: string[];
  categoryId?: string;
  dealerPriceWoMotor?: Decimal.Value | null;
  dealerPrice?: Decimal.Value | null;
  customerPrice?: Decimal.Value | null;
  gstRate?: Decimal.Value | null;
  isStockItem?: boolean;
  active?: boolean;
};

export async function updateProduct(input: UpdateProductInput) {
  const before = await prisma.product.findFirst({
    where: { tenantId: input.tenantId, id: input.id },
  });
  if (!before) throw new AppError("NOT_FOUND", "Product not found.");

  const nextName = input.name ?? before.name;
  const nextSpec = input.spec === undefined ? before.spec : input.spec;
  const nextAliases = input.aliases ?? before.aliases;
  const nextSearchText = buildSearchText({
    name: nextName,
    spec: nextSpec,
    aliases: nextAliases,
  });

  const priceChanged =
    (input.dealerPriceWoMotor !== undefined &&
      !decEq(before.dealerPriceWoMotor, input.dealerPriceWoMotor)) ||
    (input.dealerPrice !== undefined && !decEq(before.dealerPrice, input.dealerPrice)) ||
    (input.customerPrice !== undefined && !decEq(before.customerPrice, input.customerPrice));

  const after = await prisma.$transaction(async (tx) => {
    const u = await tx.product.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.spec !== undefined && { spec: input.spec }),
        ...(input.aliases !== undefined && { aliases: input.aliases }),
        ...(input.categoryId !== undefined && { categoryId: input.categoryId }),
        ...(input.dealerPriceWoMotor !== undefined && {
          dealerPriceWoMotor: toDecimalOrNull(input.dealerPriceWoMotor),
        }),
        ...(input.dealerPrice !== undefined && {
          dealerPrice: toDecimalOrNull(input.dealerPrice),
        }),
        ...(input.customerPrice !== undefined && {
          customerPrice: toDecimalOrNull(input.customerPrice),
        }),
        ...(input.gstRate !== undefined && { gstRate: toDecimalOrNull(input.gstRate) }),
        ...(input.isStockItem !== undefined && { isStockItem: input.isStockItem }),
        ...(input.active !== undefined && { active: input.active }),
        searchText: nextSearchText,
      },
    });

    if (priceChanged) {
      await tx.productPriceHistory.create({
        data: {
          productId: input.id,
          dealerPriceWoMotor: u.dealerPriceWoMotor,
          dealerPrice: u.dealerPrice,
          customerPrice: u.customerPrice,
          changedById: input.actorId,
        },
      });
    }

    return u;
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: priceChanged ? "PRODUCT_PRICE_CHANGE" : "PRODUCT_UPDATE",
    entity: "Product",
    entityId: after.id,
    before: {
      name: before.name,
      dealerPrice: before.dealerPrice?.toString() ?? null,
      dealerPriceWoMotor: before.dealerPriceWoMotor?.toString() ?? null,
      customerPrice: before.customerPrice?.toString() ?? null,
      active: before.active,
    },
    after: {
      name: after.name,
      dealerPrice: after.dealerPrice?.toString() ?? null,
      dealerPriceWoMotor: after.dealerPriceWoMotor?.toString() ?? null,
      customerPrice: after.customerPrice?.toString() ?? null,
      active: after.active,
    },
  });

  return after;
}

export type CreateCategoryInput = {
  tenantId: string;
  actorId: string;
  name: string;
  sortOrder?: number;
};

export async function createCategory(input: CreateCategoryInput) {
  const exists = await prisma.productCategory.findFirst({
    where: { tenantId: input.tenantId, name: input.name },
  });
  if (exists) throw new AppError("CONFLICT", "A category with this name already exists.");

  const row = await prisma.productCategory.create({
    data: {
      tenantId: input.tenantId,
      name: input.name,
      sortOrder: input.sortOrder ?? 0,
    },
  });
  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "CATEGORY_CREATE",
    entity: "ProductCategory",
    entityId: row.id,
    after: { name: row.name },
  });
  return row;
}

function toDecimalOrNull(v: Decimal.Value | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const d = new Decimal(v);
  if (d.isNaN()) return null;
  return d.toString();
}

function decEq(a: Prisma.Decimal | null, b: Decimal.Value | null | undefined): boolean {
  if (a === null && (b === null || b === undefined)) return true;
  if (a === null || b === null || b === undefined) return false;
  return new Decimal(a.toString()).equals(new Decimal(b));
}
