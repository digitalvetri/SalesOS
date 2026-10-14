// Give every login a username (2026-10-15): Owner → "sadmin", everyone else → their
// first name ("naren"), and create the single PRODUCTION login if there isn't one.
//   PRODUCTION_PASSWORD='…' tsx scripts/set-usernames.ts
// Existing usernames are left alone. Prints the usernames (never passwords).
import { prisma } from "../src/server/repo/client";
import { normalizeUsername } from "../src/server/domain/auth/username";
import { hashPassword } from "../src/server/auth/password";

async function main() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!tenant) throw new Error("No company found.");
  const users = await prisma.user.findMany({ where: { tenantId: tenant.id }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] });
  const taken = new Set(users.map((u) => u.username).filter((u): u is string => !!u));
  const pick = (base: string) => {
    let name = base || "user";
    for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
    taken.add(name);
    return name;
  };

  for (const u of users) {
    if (u.username) continue;
    const base = u.role === "OWNER" ? "sadmin" : normalizeUsername(u.name.split(/\s+/)[0] ?? u.name).replace(/[^a-z0-9._-]/g, "");
    const username = pick(base);
    await prisma.user.update({ where: { id: u.id }, data: { username } });
  }

  if (!users.some((u) => u.role === "PRODUCTION")) {
    const password = process.env.PRODUCTION_PASSWORD;
    if (!password || password.length < 8) throw new Error("Set PRODUCTION_PASSWORD (8+ characters) to create the production login.");
    let phone = "+919000000099";
    for (let n = 99; await prisma.user.findFirst({ where: { tenantId: tenant.id, phoneE164: phone } }); n++) phone = `+9190000001${String(n).padStart(2, "0")}`;
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        name: "Production",
        username: pick("production"),
        phoneE164: phone,
        role: "PRODUCTION",
        passwordHash: await hashPassword(password),
        passwordSetAt: new Date(),
      },
    });
  }

  const all = await prisma.user.findMany({ where: { tenantId: tenant.id }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { name: true, username: true, role: true, active: true } });
  for (const u of all) console.log(`${u.role.padEnd(10)} ${u.name.padEnd(14)} → ${u.username}${u.active ? "" : " (inactive)"}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
