// Seed the real pilot team (KI/KFM) based on the Google Sheet access list.
// Password for everyone: Sales@2026 (admin can change per-person in /employees).
//
// Dry run by default. Pass --commit to actually create.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const COMMIT = process.argv.includes("--commit");
const PASSWORD = "Sales@2026";

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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
console.log(`\nPassword for all newly-created users: ${PASSWORD}`);

if (!COMMIT) {
  console.log("\nDry run — pass --commit to actually create accounts.");
  await prisma.$disconnect();
  process.exit(0);
}

console.log("\n=== Committing ===");
let created = 0;
for (const row of plan) {
  if (row.action.startsWith("SKIP")) continue;
  // Create Supabase auth user
  const authRes = await sb.auth.admin.createUser({
    email: row.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: row.name, role: row.role, tenantId: tenant.id, phoneE164: row.phoneE164 },
  });
  if (authRes.error || !authRes.data.user) {
    console.error(`  FAIL ${row.email}: ${authRes.error?.message ?? "unknown"}`);
    continue;
  }
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      authUserId: authRes.data.user.id,
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

console.log(`\nCreated ${created} users. Login: {email} / ${PASSWORD}`);
await prisma.$disconnect();
