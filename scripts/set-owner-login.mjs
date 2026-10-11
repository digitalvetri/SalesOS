// Set the Owner's login email + password. One-off.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const NEW_EMAIL = (process.argv[2] ?? "team.digitalvetri@gmail.com").toLowerCase();
const NEW_PASSWORD = process.argv[3] ?? "Sales@2026";

const prisma = new PrismaClient();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const owner = await prisma.user.findFirst({
  where: { role: "OWNER", active: true },
  select: { id: true, name: true, email: true, authUserId: true },
});
if (!owner) throw new Error("No active OWNER");

console.log(`Owner: ${owner.name}`);
console.log(`  current email: ${owner.email}`);
console.log(`  → new email:   ${NEW_EMAIL}`);
console.log(`  → new password: ${NEW_PASSWORD}\n`);

const { error: eErr } = await sb.auth.admin.updateUserById(owner.authUserId, {
  email: NEW_EMAIL,
  password: NEW_PASSWORD,
  email_confirm: true,
});
if (eErr) throw new Error(`Supabase: ${eErr.message}`);
await prisma.user.update({ where: { id: owner.id }, data: { email: NEW_EMAIL } });

console.log("Done. Log in with:");
console.log(`  Email:    ${NEW_EMAIL}`);
console.log(`  Password: ${NEW_PASSWORD}`);
await prisma.$disconnect();
