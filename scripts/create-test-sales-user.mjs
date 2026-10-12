// One-off: create a SALES user so we can see the Employee Overview.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const EMAIL = "sales.demo@salesos.in";
function required(name, value) {
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment (see .env.example).`);
    process.exit(1);
  }
  return value;
}
const PASSWORD = required("BOOTSTRAP_PASSWORD", process.env.BOOTSTRAP_PASSWORD);
const prisma = new PrismaClient();
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const existing = await prisma.user.findFirst({ where: { email: EMAIL } });
if (existing) {
  console.log(`Already exists: ${existing.name} (${existing.id})`);
  await prisma.$disconnect();
  process.exit(0);
}

const tenant = await prisma.tenant.findFirst({
  where: { name: "KI-KFM Pilot" },
  select: { id: true },
});
if (!tenant) throw new Error("No KI-KFM Pilot tenant");

const auth = await sb.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
});
if (auth.error) throw auth.error;

const u = await prisma.user.create({
  data: {
    tenantId: tenant.id,
    authUserId: auth.data.user.id,
    name: "Sales Demo",
    email: EMAIL,
    phoneE164: "+919000000050",
    role: "SALES",
  },
});
console.log(`Created SALES user ${u.name} / ${EMAIL}`);
await prisma.$disconnect();
