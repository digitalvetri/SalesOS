// Backfill User.email for existing accounts whose Supabase email is still the
// synthetic {phone}@salesos.local placeholder. Keeps the current auth working:
// each user can log in by entering their synthetic email, until admin edits
// their email in Settings → Users.
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const users = await p.user.findMany({ where: { email: null }, select: { id: true, phoneE164: true } });
console.log(`Users without email: ${users.length}`);
let n = 0;
for (const u of users) {
  const synthetic = `${u.phoneE164.replace(/^\+/, "")}@salesos.local`;
  await p.user.update({ where: { id: u.id }, data: { email: synthetic.toLowerCase() } });
  n++;
}
console.log(`Backfilled ${n} users with their synthetic email as placeholder.`);
await p.$disconnect();
