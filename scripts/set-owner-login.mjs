// Set the Owner's login email + password. One-off.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

function required(name, value) {
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment (see .env.example).`);
    process.exit(1);
  }
  return value;
}
const NEW_EMAIL = required("email (arg 1)", process.argv[2]).toLowerCase();
const NEW_PASSWORD = required("password (arg 2)", process.argv[3]);

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
console.log(`  → new password set (not printed)\n`);

const { error: eErr } = await sb.auth.admin.updateUserById(owner.authUserId, {
  email: NEW_EMAIL,
  password: NEW_PASSWORD,
  email_confirm: true,
});
if (eErr) throw new Error(`Supabase: ${eErr.message}`);
await prisma.user.update({ where: { id: owner.id }, data: { email: NEW_EMAIL } });

console.log("Done. Log in with:");
console.log(`  Email:    ${NEW_EMAIL}`);
console.log(`  Password: (as given)`);
await prisma.$disconnect();
