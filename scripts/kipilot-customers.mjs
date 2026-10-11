import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const cs = await p.customer.findMany({
  where: { tenantId: "cmv3gxtqq0000f8jcvekeeig5" },
  orderBy: { createdAt: "desc" },
  select: { id: true, name: true, businessName: true, phoneE164: true, createdAt: true, _count: { select: { orders: true } } },
});
console.log(`KI-KFM Pilot customers: ${cs.length}`);
for (const c of cs) {
  console.log(`  ${c.createdAt.toISOString().slice(0, 19)}  ${(c.businessName ?? c.name).padEnd(32)}  ${c.phoneE164}  orders=${c._count.orders}`);
}
await p.$disconnect();
