// First-run setup for a brand-new production database (Coolify/Docker).
// Runs once at server start (see src/instrumentation.ts) and only when:
//   - BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD are set, and
//   - the database has no tenant yet.
// It creates the company, the KI / KFM billing entities and the Owner login.
// Remove the BOOTSTRAP_* variables once you've signed in.
import { prisma } from "@/server/repo/client";
import { supabaseService } from "@/lib/supabase/service";

export async function runFirstRunSetup() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (!email || !password) return;

  if ((await prisma.tenant.count()) > 0) return;

  const company = process.env.BOOTSTRAP_COMPANY_NAME?.trim() || "Kumaar Industries";
  const ownerName = process.env.BOOTSTRAP_OWNER_NAME?.trim() || "Kumar";
  const ownerPhone = process.env.BOOTSTRAP_OWNER_PHONE?.trim() || "+910000000001";

  // 1) Supabase login (create, or reset the password if the email already exists).
  const sb = supabaseService();
  let authUserId: string | null = null;
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.data.user) {
    authUserId = created.data.user.id;
  } else {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = data.users.find((u) => u.email?.toLowerCase() === email);
    if (!existing) throw new Error(`[first-run] could not create auth user: ${created.error?.message}`);
    await sb.auth.admin.updateUserById(existing.id, { password });
    authUserId = existing.id;
  }

  // 2) Company, billing entities and the Owner row — all or nothing.
  await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: { slug: "main", name: company, settings: { create: {} } },
    });
    const ki = await tx.billingEntity.create({
      data: { tenantId: tenant.id, code: "KI", name: "Kumaar Industries" },
    });
    await tx.billingEntity.create({
      data: { tenantId: tenant.id, code: "KFM", name: "Kumaar Food Machinery" },
    });
    await tx.user.create({
      data: {
        tenantId: tenant.id,
        authUserId: authUserId!,
        name: ownerName,
        email,
        phoneE164: ownerPhone,
        role: "OWNER",
        lang: "en",
        defaultEntityId: ki.id,
        passwordSetAt: new Date(),
      },
    });
  });

  console.log(`[first-run] created company "${company}" and Owner login ${email}`);
}
