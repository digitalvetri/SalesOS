// Seed the real pilot team (KI/KFM) based on the Google Sheet access list.
// Temporary password for everyone comes from BOOTSTRAP_PASSWORD (admin can change per-person in /employees).
//
// Dry run by default. Pass --commit to actually create.
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/server/auth/password";
import "dotenv/config";

const COMMIT = process.argv.includes("--commit");
function required(name, value) {
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment (see .env.example).`);
    process.exit(1);
  }
  return value;
}
const PASSWORD = required("BOOTSTRAP_PASSWORD", process.env.BOOTSTRAP_PASSWORD);

// Mapped from the Google Sheet "People with access" screenshots:
//   • Sales reps (SALES role)
//   • Office / admin (ADMIN role)
//   • Owner is seeded separately — do not overwrite the active OWNER here.
const PILOT_TEAM = [
  // Sales (what shows on /employees)
  { email: "saleskidhanushya@gmail.com", name: "Dhanushya", role: "SALES",   phoneE164: "+919000000011" },
  { email: "saleskimurugan@gmail.com",   name: "Murugan",   role: "SALES",   phoneE164: "+919000000012" },
  { email: "saleskisnegha@gmail.com",    name: "Snegha",    role: "SALES",   phoneE164: "+919000000013" },
  { email: "saleskivignesh@gmail.com",   name: "Vignesh",   role: "SALES",   phoneE164: "+919000000014" },

  // Office / admin / purchase
  { email: "avinashavi01996@gmail.com",      name: "Avinash",            role: "ADMIN",    phoneE164: "+919000000021" },
  { email: "avinashsupervisorki@gmail.com",  name: "Avinash Supervisor", role: "ADMIN",    phoneE164: "+919000000022" },
  { email: "mallikamithun2003@gmail.com",    name: "Mallika Palanisamy", role: "ACCOUNTS", phoneE164: "+919000000023" },
  { email: "n2kumar7@gmail.com",             name: "Nagendra Kumar",     role: "ADMIN",    phoneE164: "+919000000024" },
  { email: "purchaseteam2025@gmail.com",     name: "Purchase Team",      role: "ADMIN",    phoneE164: "+919000000025" },
  { email: "kumaarindustries@gmail.com",     name: "KI Office",          role: "ADMIN",    phoneE164: "+919000000026" },
  { email: "kumarindustries117@gmail.com",   name: "KI Office 2",        role: "ADMIN",    phoneE164: "+919000000027" },
];

const prisma = new PrismaClient();

const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
if (!tenant) throw new Error("No tenant found");
console.log(`Tenant: ${tenant.name} (${tenant.id})\n`);

// Plan
const existingByEmail = new Map(
  (await prisma.user.findMany({ where: { tenantId: tenant.id }, select: { id: true, email: true } }))
    .map((u) => [u.email?.toLowerCase() ?? "", u.id]),
);

const plan = [];
for (const t of PILOT_TEAM) {
  const existing = existingByEmail.get(t.email.toLowerCase());
  plan.push({ ...t, action: existing ? "SKIP (already present)" : "CREATE" });
}

console.log("=== Plan ===");
for (const row of plan) {
  console.log(`  [${row.action.padEnd(22)}] ${row.role.padEnd(8)} ${row.name.padEnd(26)} ${row.email}`);
}
console.log(`\nNewly-created users get the BOOTSTRAP_PASSWORD temporary password.`);

if (!COMMIT) {
  console.log("\nDry run — pass --commit to actually create accounts.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("\n=== Committing ===");
let created = 0;
for (const row of plan) {
  if (row.action.startsWith("SKIP")) continue;
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      passwordHash: await hashPassword(PASSWORD),
      passwordSetAt: new Date(),
      name: row.name,
      email: row.email,
      phoneE164: row.phoneE164,
      role: row.role,
      canReceivePayments: row.role === "SALES",
    },
  });
  console.log(`  ✓ ${row.email}`);
  created++;
}

console.log(`\nCreated ${created} users. Login: {email} / BOOTSTRAP_PASSWORD`);
await prisma.$disconnect();
