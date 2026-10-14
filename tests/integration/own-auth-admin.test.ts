// Own auth (replaces Supabase): admin user tools store scrypt hashes and end
// sessions when a password changes or a user is switched off.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { adminCreateUser, adminSetPassword, adminDeactivateUser } from "@/server/services/userService";
import { verifyPassword } from "@/server/auth/password";

config({ path: ".env.local" });
config({ path: ".env" });

const DB_REACHABLE =
  Boolean(process.env.DATABASE_URL) &&
  (/:55433\b/.test(process.env.DATABASE_URL!) || process.env.SB_INTEGRATION_TESTS === "1");

describe.skipIf(!DB_REACHABLE)("own auth — admin user tools", () => {
  const prisma = new PrismaClient();
  const slug = `test-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let tenantId = "";
  let ownerId = "";

  beforeAll(async () => {
    tenantId = (await prisma.tenant.create({ data: { slug, name: "own-auth.test", settings: { create: {} } } })).id;
    ownerId = (
      await prisma.user.create({ data: { tenantId, name: "Owner", phoneE164: "+919999922001", role: "OWNER" } })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { tenantId } }); // sessions cascade
    await prisma.tenantSettings.delete({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  }, 60_000);

  const addSession = (userId: string) =>
    prisma.session.create({
      data: { id: `${userId}-${Math.random()}`, userId, expiresAt: new Date(Date.now() + 86_400_000) },
    });

  it("creates a user with a verifiable scrypt hash (never the plain password)", async () => {
    const u = await adminCreateUser({
      tenantId, actorId: ownerId, actorRole: "OWNER",
      username: "New Rep", email: "New.Rep@Example.com", phoneE164: "+919999922002", password: "Temp-pass-123",
      name: "New Rep", role: "SALES",
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.email).toBe("new.rep@example.com");
    expect(row.passwordHash).not.toContain("Temp-pass-123");
    expect(await verifyPassword("Temp-pass-123", row.passwordHash)).toBe(true);
  });

  it("refuses passwords shorter than 8 characters", async () => {
    await expect(
      adminCreateUser({
        tenantId, actorId: ownerId, actorRole: "OWNER",
        username: "short", email: "short@example.com", phoneE164: "+919999922003", password: "short",
        name: "Short", role: "SALES",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("setting a new password replaces the hash and signs the user out everywhere", async () => {
    const u = await prisma.user.findFirstOrThrow({ where: { tenantId, email: "new.rep@example.com" } });
    await addSession(u.id);
    await addSession(u.id);
    await adminSetPassword({ tenantId, actorId: ownerId, userId: u.id, newPassword: "Brand-new-456" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword("Brand-new-456", row.passwordHash)).toBe(true);
    expect(await verifyPassword("Temp-pass-123", row.passwordHash)).toBe(false);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("deactivating a user ends their sessions", async () => {
    const u = await prisma.user.findFirstOrThrow({ where: { tenantId, email: "new.rep@example.com" } });
    await addSession(u.id);
    await adminDeactivateUser({ tenantId, actorId: ownerId, actorRole: "OWNER", userId: u.id });
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
  });
});
