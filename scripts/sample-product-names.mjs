import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const prods = await p.product.findMany({
  where: { active: true },
  select: { name: true, categoryId: true },
  orderBy: { name: "asc" },
});
const byCat = new Map();
for (const r of prods) {
  if (!byCat.has(r.categoryId)) byCat.set(r.categoryId, []);
  byCat.get(r.categoryId).push(r.name);
}
console.log(`Total active products: ${prods.length}`);
console.log(`Distinct categories: ${byCat.size}\n`);
// Print 40 random names to see variety
const names = prods.map((x) => x.name);
const shuf = [...names].sort(() => Math.random() - 0.5).slice(0, 60);
for (const n of shuf) console.log(n);
await p.$disconnect();
