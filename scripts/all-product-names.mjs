import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const prods = await p.product.findMany({
  where: { active: true },
  select: { name: true },
  orderBy: { name: "asc" },
});
for (const r of prods) console.log(r.name);
await p.$disconnect();
