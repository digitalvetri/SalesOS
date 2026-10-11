// Seed for Phase P0: tenant, billing entities, accounts, users.
// Products / customers / orders arrive in later phases (see spec §16).
//
// Users here are created in the SalesOS `User` table. Their Supabase auth.users
// counterparts must be created separately by the admin flow (service-role client)
// — a bootstrap script is provided via `pnpm tsx scripts/bootstrap-auth-users.ts`.
import { PrismaClient, Role, AccountKind, Lang } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_TENANT_SLUG = "ki-kfm-pilot";
const SEED_TENANT_NAME = "KI-KFM Pilot";

// Per spec §16 seed data. authUserId is a placeholder until Supabase auth users are bootstrapped.
const USERS: Array<{
  name: string;
  phoneE164: string;
  role: Role;
  canReceivePayments?: boolean;
  defaultEntityCode?: "KI" | "KFM";
  lang?: Lang;
}> = [
  { name: "Kumar", phoneE164: "+919840000001", role: "OWNER", defaultEntityCode: "KI" },
  { name: "Office Admin", phoneE164: "+919840000002", role: "ADMIN", defaultEntityCode: "KI" },
  { name: "Accountant", phoneE164: "+919840000003", role: "ACCOUNTS" },
  { name: "Naren", phoneE164: "+919840000011", role: "SALES", canReceivePayments: true, defaultEntityCode: "KFM" },
  { name: "Mallika", phoneE164: "+919840000012", role: "SALES", canReceivePayments: true, defaultEntityCode: "KI" },
  { name: "Viji", phoneE164: "+919840000013", role: "SALES", canReceivePayments: true, defaultEntityCode: "KI" },
  { name: "Vignesh", phoneE164: "+919840000014", role: "SALES", canReceivePayments: true, defaultEntityCode: "KFM" },
  { name: "Dhanushya", phoneE164: "+919840000015", role: "SALES", canReceivePayments: true, defaultEntityCode: "KI" },
  { name: "Snegha", phoneE164: "+919840000016", role: "SALES", canReceivePayments: true, defaultEntityCode: "KFM" },
  { name: "Murugan", phoneE164: "+919840000017", role: "SALES", canReceivePayments: true, defaultEntityCode: "KI" },
  { name: "Workshop", phoneE164: "+919840000021", role: "DISPATCH" },
];

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: SEED_TENANT_SLUG },
    update: { name: SEED_TENANT_NAME },
    create: { slug: SEED_TENANT_SLUG, name: SEED_TENANT_NAME },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id },
  });

  const ki = await prisma.billingEntity.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "KI" } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "KI",
      name: "Kumaar Industries",
    },
  });

  const kfm = await prisma.billingEntity.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "KFM" } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: "KFM",
      name: "Kumaar Food Machinery",
    },
  });

  async function ensureAccount(entityId: string, label: string, kind: AccountKind) {
    const existing = await prisma.account.findFirst({ where: { tenantId: tenant.id, entityId, label } });
    if (existing) return existing;
    return prisma.account.create({
      data: { tenantId: tenant.id, entityId, label, kind },
    });
  }

  await ensureAccount(ki.id, "KI Current A/c", "BANK");
  await ensureAccount(ki.id, "KI UPI Scanner", "UPI");
  await ensureAccount(ki.id, "KI Cash Drawer", "CASH_DRAWER");
  await ensureAccount(kfm.id, "KFM Current A/c", "BANK");
  await ensureAccount(kfm.id, "KFM UPI Scanner", "UPI");

  for (const u of USERS) {
    const defaultEntityId =
      u.defaultEntityCode === "KI" ? ki.id : u.defaultEntityCode === "KFM" ? kfm.id : null;
    await prisma.user.upsert({
      where: { tenantId_phoneE164: { tenantId: tenant.id, phoneE164: u.phoneE164 } },
      update: {},
      create: {
        tenantId: tenant.id,
        authUserId: `seed:${u.phoneE164}`, // replaced by bootstrap-auth-users.ts with the real Supabase uid
        name: u.name,
        phoneE164: u.phoneE164,
        role: u.role,
        lang: u.lang ?? "en",
        defaultEntityId: defaultEntityId ?? null,
        canReceivePayments: u.canReceivePayments ?? false,
      },
    });
  }

  console.log(`Seed complete. Tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`  Entities: KI=${ki.id}, KFM=${kfm.id}`);
  console.log(`  Users: ${USERS.length}`);
  console.log("Next: run `pnpm tsx scripts/bootstrap-auth-users.ts` to create Supabase auth users and link authUserId.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
