// Delete every non-Owner user + their test orders/payments/targets.
// Keeps the active OWNER so you stay logged in.
//
// Dry run by default. Pass --commit to actually wipe.
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const COMMIT = process.argv.includes("--commit");
const prisma = new PrismaClient();

const activeOwners = await prisma.user.findMany({
  where: { role: "OWNER", active: true },
  select: { id: true, email: true, authUserId: true },
});
const keepIds = new Set(activeOwners.map((o) => o.id));
console.log(`Keeping ${activeOwners.length} active OWNER(s):`);
for (const o of activeOwners) console.log(`  ✓ ${o.email}`);

const toDelete = await prisma.user.findMany({
  where: { id: { notIn: Array.from(keepIds) } },
  select: { id: true, name: true, email: true, role: true, authUserId: true },
});

const [orderCount, paymentCount, targetCount, auditCount] = await Promise.all([
  prisma.order.count({ where: { salespersonId: { in: toDelete.map((u) => u.id) } } }),
  prisma.payment.count({ where: { verifiedById: { in: toDelete.map((u) => u.id) } } }),
  prisma.salesTarget.count({ where: { userId: { in: toDelete.map((u) => u.id) } } }),
  prisma.auditLog.count({ where: { actorId: { in: toDelete.map((u) => u.id) } } }),
]);

console.log(`\nWill delete ${toDelete.length} users:`);
for (const u of toDelete) console.log(`  ✗ ${u.role.padEnd(8)} ${u.name.padEnd(22)} ${u.email}`);
console.log(`\nCascading data:`);
console.log(`  ${orderCount}  orders`);
console.log(`  ${paymentCount}  payments (verifiedBy)`);
console.log(`  ${targetCount}  sales targets`);
console.log(`  ${auditCount}  audit log entries`);

if (!COMMIT) {
  console.log(`\nDry run — pass --commit to actually wipe.`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\n=== Wiping ===`);

// 1. Delete orders owned by these users. No CASCADE on the FKs — we must
// delete children bottom-up: DispatchLine → Dispatch → OrderLine →
// OrderCharge / OrderEvent / Payment / FollowUp → WhatsAppMessage.orderId
// nulled → Order.
const orderIds = (await prisma.order.findMany({
  where: { salespersonId: { in: toDelete.map((u) => u.id) } },
  select: { id: true },
})).map((o) => o.id);
console.log(`  wiping ${orderIds.length} orders + children`);
if (orderIds.length > 0) {
  const dispatches = await prisma.dispatch.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  const dispatchIds = dispatches.map((d) => d.id);
  await prisma.dispatchLine.deleteMany({ where: { dispatchId: { in: dispatchIds } } });
  await prisma.dispatch.deleteMany({ where: { id: { in: dispatchIds } } });
  await prisma.followUp.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderCharge.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderLine.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.whatsAppMessage.updateMany({ where: { orderId: { in: orderIds } }, data: { orderId: null } });
  const delOrders = await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  console.log(`  deleted ${delOrders.count} orders (+ children)`);
}

// 2. Null out verifiedBy on remaining payments (if any).
const nulledVerified = await prisma.payment.updateMany({
  where: { verifiedById: { in: toDelete.map((u) => u.id) } },
  data: { verifiedById: null },
});
console.log(`  nulled verifiedBy on ${nulledVerified.count} remaining payments`);

// 3. Delete sales targets.
const delTargets = await prisma.salesTarget.deleteMany({
  where: { userId: { in: toDelete.map((u) => u.id) } },
});
console.log(`  deleted ${delTargets.count} sales targets`);

// 4. Delete audit log entries authored by these users.
const delAudit = await prisma.auditLog.deleteMany({
  where: { actorId: { in: toDelete.map((u) => u.id) } },
});
console.log(`  deleted ${delAudit.count} audit log rows`);

// 5. Delete the User rows.
const delUsers = await prisma.user.deleteMany({
  where: { id: { in: toDelete.map((u) => u.id) } },
});
console.log(`  deleted ${delUsers.count} User rows`);

// Their login sessions are removed with the User rows (ON DELETE CASCADE).

console.log(`\nDone. ${toDelete.length} employees removed. Only the OWNER remains.`);
await prisma.$disconnect();
