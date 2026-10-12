// Dump what Supabase currently has for the Owner's auth user.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const prisma = new PrismaClient();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const owner = await prisma.user.findFirst({
  where: { role: "OWNER", active: true },
  select: { authUserId: true, email: true, name: true },
});
console.log("DB owner:", owner);

const { data, error } = await sb.auth.admin.getUserById(owner.authUserId);
if (error) {
  console.log("Supabase getUserById error:", error);
  process.exit(1);
}
const u = data.user;
console.log("\nSupabase user:");
console.log(`  id:                 ${u.id}`);
console.log(`  email:              ${u.email}`);
console.log(`  email_confirmed_at: ${u.email_confirmed_at}`);
console.log(`  confirmed_at:       ${u.confirmed_at}`);
console.log(`  banned_until:       ${u.banned_until}`);
console.log(`  is_sso_user:        ${u.is_sso_user}`);
console.log(`  last_sign_in_at:    ${u.last_sign_in_at}`);
await prisma.$disconnect();
