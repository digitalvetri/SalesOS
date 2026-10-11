import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const cats = await p.productCategory.findMany({ orderBy: { name: "asc" } });
console.log(`Categories (${cats.length}):`);
for (const c of cats) {
  const n = await p.product.count({ where: { categoryId: c.id, active: true } });
  console.log(`  ${c.name} — ${n} active`);
}
console.log(`Total active products: ${await p.product.count({ where: { active: true } })}`);
await p.$disconnect();
