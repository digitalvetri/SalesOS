// Set a user's login email and password (e.g. the Owner).
// Usage: pnpm exec dotenv run -f .env.local -- tsx scripts/set-login.ts <current-email-or-phone> <new-email> <new-password>
import { PrismaClient } from "@prisma/client";
import { hashPassword, PASSWORD_MIN_LENGTH } from "../src/server/auth/password";

async function main() {
  const [who, newEmailRaw, newPassword] = process.argv.slice(2);
  if (!who || !newEmailRaw || !newPassword) {
    console.error("Usage: tsx scripts/set-login.ts <current-email-or-+91phone> <new-email> <new-password>");
    process.exit(1);
  }
  if (newPassword.length < PASSWORD_MIN_LENGTH) throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { OR: [{ email: who.toLowerCase() }, { phoneE164: who }] } });
    if (!user) throw new Error(`No user with email/phone ${who}`);
    const email = newEmailRaw.toLowerCase();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { email, passwordHash: await hashPassword(newPassword), passwordSetAt: new Date() },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);
    console.log(`Updated ${user.name} (${user.role}): login ${email} (password not printed).`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
