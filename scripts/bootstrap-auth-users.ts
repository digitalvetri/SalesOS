// Gives every user without a password (e.g. freshly seeded) a login:
//   - email: keeps User.email, or uses <phone digits>@phone.salesos.local if empty
//   - password: BOOTSTRAP_PASSWORD (temporary; tell each user, admin can reset later)
//
// Usage:
//   BOOTSTRAP_PASSWORD='A-strong-temporary-password' pnpm bootstrap:auth
// --reset-all (or `pnpm auth:reset-passwords`): also resets users who already
// have a password. Signs them out everywhere.
import { PrismaClient } from "@prisma/client";
import { hashPassword, PASSWORD_MIN_LENGTH } from "../src/server/auth/password";

const syntheticEmail = (e164: string) => `${e164.replace(/^\+/, "")}@phone.salesos.local`;

async function main() {
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`BOOTSTRAP_PASSWORD is required (at least ${PASSWORD_MIN_LENGTH} characters).`);
  }
  const resetAll = process.argv.includes("--reset-all");
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: resetAll ? {} : { passwordHash: null },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
    console.log(`Found ${users.length} user(s) to ${resetAll ? "reset" : "bootstrap"}.`);
    const hash = await hashPassword(password);
    for (const u of users) {
      const email = u.email ?? syntheticEmail(u.phoneE164);
      await prisma.$transaction([
        prisma.user.update({ where: { id: u.id }, data: { email, passwordHash: hash, passwordSetAt: new Date() } }),
        prisma.session.deleteMany({ where: { userId: u.id } }),
      ]);
      console.log(`  ✓ ${u.name} (${u.role}) → ${email}`);
    }
    console.log("Done. Temporary password = BOOTSTRAP_PASSWORD (not printed).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
