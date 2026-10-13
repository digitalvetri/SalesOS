// First-run setup for a brand-new production database (Coolify/Docker).
// Runs once at server start (see src/instrumentation.ts) and only when:
//   - BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD are set, and
//   - the database has no tenant yet.
// It creates the company, the KI / KFM billing entities and the Owner login
// (email + scrypt password hash).
// Remove the BOOTSTRAP_* variables once you've signed in.
import { prisma } from "@/server/repo/client";
import { hashPassword } from "@/server/auth/password";

export async function runFirstRunSetup() {
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_OWNER_PASSWORD;
  if (!email || !password) return;

  if ((await prisma.tenant.count()) > 0) return;

  const company = process.env.BOOTSTRAP_COMPANY_NAME?.trim() || "Kumaar Industries";
  const ownerName = process.env.BOOTSTRAP_OWNER_NAME?.trim() || "Kumar";
  const ownerPhone = process.env.BOOTSTRAP_OWNER_PHONE?.trim() || "+910000000001";

  // Company, billing entities and the Owner login — all or nothing.
  const passwordHash = await hashPassword(password);
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
        passwordHash,
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
