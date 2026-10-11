import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const customers = await p.customer.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    name: true,
    businessName: true,
    phoneE164: true,
    createdAt: true,
    tenantId: true,
    _count: { select: { orders: true } },
  },
});
console.log(`\n=== Last 10 customers (${await p.customer.count()} total) ===`);
for (const c of customers) {
  console.log(
    `  ${c.createdAt.toISOString().slice(0, 19)}  ${(c.businessName ?? c.name).padEnd(28)} ${c.phoneE164}  orders=${c._count.orders}  tenant=${c.tenantId.slice(-6)}`,
  );
}

const orders = await p.order.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    number: true,
    status: true,
    total: true,
    createdAt: true,
    tenantId: true,
    salesperson: { select: { name: true, email: true } },
    customer: { select: { name: true } },
  },
});
console.log(`\n=== Last 10 orders (${await p.order.count()} total) ===`);
for (const o of orders) {
  console.log(
    `  ${o.createdAt.toISOString().slice(0, 19)}  ${o.number.padEnd(14)} ${o.status.padEnd(20)} ₹${o.total}  cust=${o.customer.name}  by=${o.salesperson.name} (${o.salesperson.email}) tenant=${o.tenantId.slice(-6)}`,
  );
}

const tenants = await p.tenant.findMany({ select: { id: true, name: true } });
console.log(`\n=== Tenants ===`);
for (const t of tenants) console.log(`  ${t.id}  ${t.name}`);

await p.$disconnect();
