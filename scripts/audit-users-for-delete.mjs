import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();

const users = await p.user.findMany({
  orderBy: [{ role: "asc" }, { name: "asc" }],
  select: { id: true, name: true, email: true, role: true, active: true },
});

console.log(`Total users: ${users.length}\n`);
for (const u of users) {
  const [orders, payments, targets] = await Promise.all([
    p.order.count({ where: { salespersonId: u.id } }),
    p.payment.count({ where: { verifiedById: u.id } }),
    p.salesTarget.count({ where: { userId: u.id } }),
  ]);
  const refs = [orders && `${orders} orders`, payments && `${payments} payments`, targets && `${targets} targets`]
    .filter(Boolean)
    .join(", ") || "no refs";
  const flag = u.role === "OWNER" && u.active ? " ← ACTIVE OWNER (KEEP)" : "";
  console.log(
    `  ${u.active ? "✓" : "✗"} ${u.role.padEnd(8)} ${u.name.padEnd(22)} ${(u.email ?? "—").padEnd(42)} ${refs}${flag}`,
  );
}
await p.$disconnect();
