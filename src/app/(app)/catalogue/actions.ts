"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import {
  createProduct,
  updateProduct,
  createCategory,
} from "@/server/services/productService";

const DecimalInput = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    if (typeof v === "number") return String(v);
    const t = v.toString().replace(/[₹,\s]/g, "");
    return t.length === 0 ? null : t;
  });

const UpdatePriceInput = z.object({
  id: z.string(),
  dealerPriceWoMotor: DecimalInput.optional(),
  dealerPrice: DecimalInput.optional(),
  customerPrice: DecimalInput.optional(),
});

export const updateProductPricesAction = makeServerAction({
  input: UpdatePriceInput,
  action: "priceList.edit",
  revalidate: "/catalogue",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await updateProduct({
      tenantId: session.tenantId,
      actorId: session.userId,
      id: parsed.id,
      dealerPriceWoMotor:
        parsed.dealerPriceWoMotor === undefined ? undefined : parsed.dealerPriceWoMotor,
      dealerPrice: parsed.dealerPrice === undefined ? undefined : parsed.dealerPrice,
      customerPrice: parsed.customerPrice === undefined ? undefined : parsed.customerPrice,
    });
    return { id: row.id };
  },
});

const UpdateMetaInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  spec: z.string().max(120).nullable().optional(),
  aliases: z.array(z.string().min(1).max(60)).max(20).optional(),
  categoryId: z.string().optional(),
  isStockItem: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateProductMetaAction = makeServerAction({
  input: UpdateMetaInput,
  action: "priceList.edit",
  revalidate: "/catalogue",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await updateProduct({
      tenantId: session.tenantId,
      actorId: session.userId,
      id: parsed.id,
      name: parsed.name,
      spec: parsed.spec,
      aliases: parsed.aliases,
      categoryId: parsed.categoryId,
      isStockItem: parsed.isStockItem,
      active: parsed.active,
    });
    return { id: row.id };
  },
});

const CreateProductInput = z.object({
  categoryId: z.string(),
  name: z.string().min(1).max(120),
  spec: z.string().max(120).nullable().optional(),
  aliases: z.array(z.string().min(1).max(60)).max(20).optional(),
  dealerPriceWoMotor: DecimalInput.optional(),
  dealerPrice: DecimalInput.optional(),
  customerPrice: DecimalInput.optional(),
  isStockItem: z.boolean().optional(),
});

export const createProductAction = makeServerAction({
  input: CreateProductInput,
  action: "priceList.edit",
  revalidate: "/catalogue",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await createProduct({
      tenantId: session.tenantId,
      actorId: session.userId,
      categoryId: parsed.categoryId,
      name: parsed.name,
      spec: parsed.spec,
      aliases: parsed.aliases ?? [],
      dealerPriceWoMotor: parsed.dealerPriceWoMotor,
      dealerPrice: parsed.dealerPrice,
      customerPrice: parsed.customerPrice,
      isStockItem: parsed.isStockItem,
    });
    return { id: row.id };
  },
});

const CreateCategoryInput = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
});

export const createCategoryAction = makeServerAction({
  input: CreateCategoryInput,
  action: "priceList.edit",
  revalidate: "/catalogue",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await createCategory({
      tenantId: session.tenantId,
      actorId: session.userId,
      name: parsed.name,
      sortOrder: parsed.sortOrder,
    });
    return { id: row.id };
  },
});
