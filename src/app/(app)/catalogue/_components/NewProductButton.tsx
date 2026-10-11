"use client";
import { Button } from "@/components/ui/button";
import { ProductFormSheet, type Category } from "./ProductFormSheet";

export function NewProductButton({ categories }: { categories: Category[] }) {
  return (
    <ProductFormSheet
      mode="create"
      categories={categories}
      trigger={<Button>+ New product</Button>}
    />
  );
}
