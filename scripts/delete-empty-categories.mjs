// Delete productCategory rows that have 0 active AND 0 inactive products.
// Safe: FK on Product.categoryId prevents deleting any category that still
// has orders attached, so this is a strict no-op if the row is in use.
import { PrismaClient } from "@prisma/client";

const COMMIT = process.argv.includes("--commit");
const p = new PrismaClient();

const cats = await p.productCategory.findMany({
  orderBy: { name: "asc" },
  select: { id: true, name: true, _count: { select: { products: true } } },
});
const empties = cats.filter((c) => c._count.products === 0);
console.log(`Empty categories (${empties.length}):`);
for (const c of empties) console.log(`  ${c.name}`);

if (!COMMIT) {
  console.log("\nDry run — pass --commit to delete.");
  await p.$disconnect();
  process.exit(0);
}

const r = await p.productCategory.deleteMany({
  where: { id: { in: empties.map((c) => c.id) } },
});
console.log(`\nDeleted ${r.count} empty categories.`);
await p.$disconnect();
