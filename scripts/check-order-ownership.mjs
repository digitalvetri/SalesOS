import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.order.groupBy({ by: ["salespersonId"], _count: true });
console.log("Order ownership:");
for (const r of rows) {
  const u = await p.user.findUnique({ where: { id: r.salespersonId }, select: { name: true, role: true, email: true } });
  console.log(`  ${r._count.toString().padStart(5)}  ${u?.name ?? "???"} (${u?.role ?? "?"}) ${u?.email ?? ""}`);
}
console.log(`\nTotal: ${await p.order.count()}`);
await p.$disconnect();
