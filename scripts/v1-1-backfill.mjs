// v1.1 S2 — backfill the new Order fields and sync the S.No counter.
// Idempotent: safe to re-run.
import { PrismaClient } from "@prisma/client";
import Decimal from "decimal.js";
import "dotenv/config";

const DRY = !process.argv.includes("--commit");
const prisma = new PrismaClient();

const STATUS_MAP = new Map([
  // v1.0 OrderStatus → v1.1 OrderStatusV2
  ["PENDING_APPROVAL",     "PENDING"],
  ["CONFIRMED",            "PENDING"],
  ["IN_PRODUCTION",        "PENDING"],
  ["READY",                "PENDING"],
  ["PARTIALLY_DISPATCHED", "PENDING"],
  ["DISPATCHED",           "PENDING"],
  ["DELIVERED",            "COMPLETED"],
  ["CLOSED",               "COMPLETED"],
  ["CANCELLED",            "CANCELLED"],
]);

const orders = await prisma.order.findMany({
  orderBy: [{ salespersonId: "asc" }, { orderDate: "asc" }, { createdAt: "asc" }],
  select: {
    id: true,
    tenantId: true,
    salespersonId: true,
    status: true,
    total: true,
    updatedAt: true,
    serialNo: true,
    productText: true,
    lines: { select: { description: true }, orderBy: { sortOrder: "asc" } },
    payments: { select: { amount: true, status: true } },
  },
});

console.log(`Scanning ${orders.length} orders…\n`);

// Group by salesperson so we can assign running serialNo.
const bySales = new Map();
for (const o of orders) {
  if (!bySales.has(o.salespersonId)) bySales.set(o.salespersonId, []);
  bySales.get(o.salespersonId).push(o);
}

const plan = [];
const counters = new Map(); // (tenantId, userId) → max serialNo

for (const [salespersonId, list] of bySales) {
  let n = 0;
  for (const o of list) {
    n++;
    const simpleStatus = STATUS_MAP.get(o.status) ?? "PENDING";
    const productText =
      o.productText ?? (o.lines.map((l) => l.description).filter(Boolean).join(", ") || "—");
    const paidTotal = o.payments
      .filter((p) => p.status !== "REJECTED")
      .reduce((s, p) => s.plus(p.amount.toString()), new Decimal(0));
    const total = new Decimal(o.total.toString());
    const newBalance = Decimal.max(total.minus(paidTotal), new Decimal(0));

    plan.push({
      id: o.id,
      serialNo: o.serialNo ?? n,
      productText,
      simpleStatus,
      completedAt: simpleStatus === "COMPLETED" ? o.updatedAt : null,
      paidTotal: paidTotal.toFixed(2),
      balanceDue: newBalance.toFixed(2),
    });

    const key = `${o.tenantId}|${salespersonId}`;
    counters.set(key, Math.max(counters.get(key) ?? 0, o.serialNo ?? n));
  }
}

console.log(`Prepared updates for ${plan.length} orders.`);
console.log(`Will seed ${counters.size} DocumentCounter rows (SNO:<userId>).`);

if (DRY) {
  console.log(`\nSample first 3 updates:`);
  for (const u of plan.slice(0, 3)) console.log(" ", u);
  console.log(`\nDry run — pass --commit to apply.`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\n=== Committing ===`);
let n = 0;
for (const u of plan) {
  await prisma.order.update({
    where: { id: u.id },
    data: {
      serialNo: u.serialNo,
      productText: u.productText,
      simpleStatus: u.simpleStatus,
      completedAt: u.completedAt,
      paidTotal: u.paidTotal,
      balanceDue: u.balanceDue,
    },
  });
  n++;
  if (n % 100 === 0) console.log(`  ${n}/${plan.length}`);
}
console.log(`  ${n}/${plan.length}`);

// Seed DocumentCounter rows so new orders pick up where the backfill left off.
for (const [key, max] of counters) {
  const [tenantId, salespersonId] = key.split("|");
  await prisma.documentCounter.upsert({
    where: { tenantId_key: { tenantId, key: `SNO:${salespersonId}` } },
    create: { tenantId, key: `SNO:${salespersonId}`, value: max },
    update: { value: max },
  });
}
console.log(`Seeded ${counters.size} S.No counters.\n`);

// Integrity verification per spec gate.
const unset = await prisma.order.count({ where: { serialNo: null } });
const bad = await prisma.$queryRaw`
  SELECT COUNT(*)::int AS n FROM "Order"
   WHERE ROUND("total" - "paidTotal", 2) <> ROUND("balanceDue", 2)
`;
console.log(`Integrity:`);
console.log(`  orders with null serialNo: ${unset}`);
console.log(`  orders where balanceDue != total - paidTotal: ${bad[0].n}`);

await prisma.$disconnect();
