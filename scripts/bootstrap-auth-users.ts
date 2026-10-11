// Creates Supabase auth users for every seeded SalesOS user whose authUserId is a
// `seed:…` placeholder, then updates authUserId to the real Supabase uid.
//
// Prerequisites:
//   - DATABASE_URL / DIRECT_URL (Supabase pooled + direct)
//   - NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   - BOOTSTRAP_PASSWORD env var (any string; use once, communicate to each user, force reset)
//
// Usage:
//   BOOTSTRAP_PASSWORD='A-strong-temporary-password' pnpm tsx scripts/bootstrap-auth-users.ts
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const PLACEHOLDER_PREFIX = "seed:";
const AUTH_EMAIL_DOMAIN = "phone.salesos.local";

function phoneToEmail(e164: string): string {
  return `${e164.replace(/^\+/, "")}@${AUTH_EMAIL_DOMAIN}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  if (!password) {
    throw new Error("BOOTSTRAP_PASSWORD is required (temporary password shared with each user).");
  }

  const prisma = new PrismaClient();
  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const users = await prisma.user.findMany({
    where: { authUserId: { startsWith: PLACEHOLDER_PREFIX } },
  });

  console.log(`Found ${users.length} user(s) needing auth bootstrap.`);
  let created = 0;
  let skipped = 0;

  for (const u of users) {
    const { data, error } = await sb.auth.admin.createUser({
      email: phoneToEmail(u.phoneE164),
      password,
      email_confirm: true,
      user_metadata: {
        name: u.name,
        role: u.role,
        tenantId: u.tenantId,
        phoneE164: u.phoneE164,
      },
    });

    if (error || !data.user) {
      console.warn(`  Skipped ${u.phoneE164} (${u.name}): ${error?.message ?? "unknown"}`);
      skipped++;
      continue;
    }

    await prisma.user.update({
      where: { id: u.id },
      data: { authUserId: data.user.id },
    });
    console.log(`  ✓ ${u.phoneE164} ${u.name} (${u.role}) → ${data.user.id}`);
    created++;
  }

  await prisma.$disconnect();
  console.log(`\nDone. Created: ${created}, skipped: ${skipped}, total scanned: ${users.length}.`);
  console.log(`Temporary password distributed via BOOTSTRAP_PASSWORD; force-reset flow lands in P1.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
