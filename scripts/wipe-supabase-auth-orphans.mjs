// Delete every Supabase auth user that no longer has a matching User row in
// the app DB. Keeps the Owner. Skips malformed authUserId gracefully.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const COMMIT = process.argv.includes("--commit");
const prisma = new PrismaClient();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const keep = new Set(
  (await prisma.user.findMany({ select: { authUserId: true } })).map((u) => u.authUserId),
);
console.log(`Keeping ${keep.size} auth users (matched to DB).`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let page = 1;
const toDelete = [];
while (true) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  for (const u of data.users) if (!keep.has(u.id)) toDelete.push({ id: u.id, email: u.email });
  if (data.users.length < 1000) break;
  page++;
}

console.log(`Orphaned auth users (not in DB): ${toDelete.length}`);
for (const u of toDelete) console.log(`  ✗ ${u.email ?? "—"}  (${u.id})`);

if (!COMMIT) {
  console.log("\nDry run — pass --commit to delete.");
  await prisma.$disconnect();
  process.exit(0);
}

let n = 0;
for (const u of toDelete) {
  if (!UUID.test(u.id)) {
    console.log(`  SKIP malformed id: ${u.id}`);
    continue;
  }
  const r = await sb.auth.admin.deleteUser(u.id);
  if (r.error) console.error(`  WARN  ${u.email}: ${r.error.message}`);
  else n++;
}
console.log(`Deleted ${n} Supabase auth users.`);
await prisma.$disconnect();
