import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

// Users per tenant
const users = await p.user.findMany({
  select: { id: true, name: true, email: true, role: true, tenantId: true, active: true },
});
console.log(`\n=== Users (${users.length}) ===`);
for (const u of users) {
  const t = await p.tenant.findUnique({ where: { id: u.tenantId }, select: { name: true } });
  console.log(
    `  ${u.active ? "✓" : "✗"} ${u.role.padEnd(8)} ${u.name.padEnd(20)} ${u.email}  → tenant=${t?.name} (${u.tenantId.slice(-6)})`,
  );
}

// Customers per tenant
console.log(`\n=== Customers per tenant ===`);
const byTenant = new Map();
for (const c of await p.customer.findMany({ select: { tenantId: true, name: true, phoneE164: true, createdAt: true } })) {
  if (!byTenant.has(c.tenantId)) byTenant.set(c.tenantId, []);
  byTenant.get(c.tenantId).push(c);
}
for (const [tid, list] of byTenant.entries()) {
  const t = await p.tenant.findUnique({ where: { id: tid }, select: { name: true } });
  console.log(`  ${t?.name} (${tid.slice(-6)}): ${list.length} customers`);
  for (const c of list.slice(0, 3)) {
    console.log(`     ${c.createdAt.toISOString().slice(0, 19)}  ${c.name}  ${c.phoneE164}`);
  }
}

await p.$disconnect();
