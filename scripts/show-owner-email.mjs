import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const owners = await p.user.findMany({
  where: { role: "OWNER" },
  select: { name: true, email: true, phoneE164: true, active: true },
});
for (const o of owners) {
  console.log(`${o.active ? "✓" : "✗"} ${o.name}`);
  console.log(`   email: ${o.email}`);
  console.log(`   phone: ${o.phoneE164}`);
}
await p.$disconnect();
