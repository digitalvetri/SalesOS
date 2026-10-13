// Admin-only user management (own auth: scrypt password hashes + DB sessions).
// Called by Server Actions in Settings → Users and Employees.
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/auth/session";
import { prisma, type Role, type Lang } from "@/server/repo/client";
import { AppError } from "@/lib/errors";
import { writeAudit } from "@/server/repo/audit";

export type AdminCreateUserInput = {
  tenantId: string;
  actorId: string; // the admin/owner doing the creation
  actorRole: Role;
  email: string;
  phoneE164: string;
  password: string;
  name: string;
  role: Role;
  lang?: Lang;
  defaultEntityId?: string | null;
  canReceivePayments?: boolean;
};

export async function adminCreateUser(input: AdminCreateUserInput) {
  if (input.role === "OWNER" && input.actorRole !== "OWNER") {
    throw new AppError("FORBIDDEN", "Only an Owner can create another Owner.");
  }

  const email = input.email.trim().toLowerCase();
  const existingEmail = await prisma.user.findFirst({
    where: { tenantId: input.tenantId, email },
  });
  if (existingEmail) {
    throw new AppError("CONFLICT", "A user with this email already exists.");
  }
  const existingPhone = await prisma.user.findUnique({
    where: { tenantId_phoneE164: { tenantId: input.tenantId, phoneE164: input.phoneE164 } },
  });
  if (existingPhone) {
    throw new AppError("CONFLICT", "A user with this mobile number already exists.");
  }

  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw new AppError("VALIDATION", `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      passwordHash,
      passwordSetAt: new Date(),
      name: input.name,
      email,
      phoneE164: input.phoneE164,
      role: input.role,
      lang: input.lang ?? "en",
      defaultEntityId: input.defaultEntityId ?? null,
      canReceivePayments: input.canReceivePayments ?? false,
    },
  });

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "USER_CREATE",
    entity: "User",
    entityId: user.id,
    after: { email: user.email, phoneE164: user.phoneE164, name: user.name, role: user.role },
  });

  return user;
}

export type AdminUpdateUserInput = {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  userId: string;
  name?: string;
  role?: Role;
  lang?: Lang;
  defaultEntityId?: string | null;
  canReceivePayments?: boolean;
  active?: boolean;
};


/** Only an Owner may change another Owner's login (email / password).
 *  Stops an Admin from taking over the Owner account. */
async function assertMayManageLogin(tenantId: string, actorId: string, target: { id: string; role: string }) {
  if (target.role !== "OWNER" || target.id === actorId) return;
  const actor = await prisma.user.findFirst({ where: { tenantId, id: actorId }, select: { role: true } });
  if (actor?.role !== "OWNER") {
    throw new AppError("FORBIDDEN", "Only an Owner can change an Owner's login.");
  }
}

export async function adminUpdateUser(input: AdminUpdateUserInput) {
  const before = await prisma.user.findFirst({
    where: { tenantId: input.tenantId, id: input.userId },
  });
  if (!before) throw new AppError("NOT_FOUND", "User not found.");

  // Admin can't promote to Owner.
  if (input.role === "OWNER" && input.actorRole !== "OWNER" && before.role !== "OWNER") {
    throw new AppError("FORBIDDEN", "Only an Owner can set another user to Owner.");
  }
  // Admin can't demote an Owner.
  if (before.role === "OWNER" && input.role && input.role !== "OWNER" && input.actorRole !== "OWNER") {
    throw new AppError("FORBIDDEN", "Only an Owner can change an Owner's role.");
  }
  // Deactivating an Owner goes through the same rules as adminDeactivateUser.
  if (input.active === false && before.role === "OWNER") {
    if (input.actorRole !== "OWNER") {
      throw new AppError("FORBIDDEN", "Only an Owner can deactivate another Owner.");
    }
    const otherActiveOwners = await prisma.user.count({
      where: { tenantId: input.tenantId, role: "OWNER", active: true, id: { not: input.userId } },
    });
    if (otherActiveOwners === 0) {
      throw new AppError("CONFLICT", "You can't turn off the last active Owner.");
    }
  }

  const after = await prisma.user.update({
    where: { id: input.userId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.lang !== undefined && { lang: input.lang }),
      ...(input.defaultEntityId !== undefined && { defaultEntityId: input.defaultEntityId }),
      ...(input.canReceivePayments !== undefined && {
        canReceivePayments: input.canReceivePayments,
      }),
      ...(input.active !== undefined && { active: input.active }),
    },
  });
  if (input.active === false) await revokeUserSessions(input.userId);

  await writeAudit(prisma, {
    tenantId: input.tenantId,
    actorId: input.actorId,
    action: "USER_UPDATE",
    entity: "User",
    entityId: after.id,
    before: {
      role: before.role,
      lang: before.lang,
      active: before.active,
      canReceivePayments: before.canReceivePayments,
      defaultEntityId: before.defaultEntityId,
      name: before.name,
    },
    after: {
      role: after.role,
      lang: after.lang,
      active: after.active,
      canReceivePayments: after.canReceivePayments,
      defaultEntityId: after.defaultEntityId,
      name: after.name,
    },
  });

  return after;
}

export async function adminDeactivateUser(opts: {
  tenantId: string;
  actorId: string;
  actorRole: Role;
  userId: string;
}) {
  const before = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, id: opts.userId },
  });
  if (!before) throw new AppError("NOT_FOUND", "User not found.");

  // Mirror of adminUpdateUser: only an Owner can deactivate another Owner.
  if (before.role === "OWNER" && opts.actorRole !== "OWNER") {
    throw new AppError("FORBIDDEN", "Only an Owner can deactivate another Owner.");
  }

  // Prevent locking the business out of itself: refuse to deactivate the last active Owner.
  if (before.role === "OWNER" && before.active) {
    const otherActiveOwners = await prisma.user.count({
      where: {
        tenantId: opts.tenantId,
        role: "OWNER",
        active: true,
        id: { not: opts.userId },
      },
    });
    if (otherActiveOwners === 0) {
      throw new AppError(
        "VALIDATION",
        "This is the last active Owner. Promote another user to Owner first.",
      );
    }
  }

  if (!before.active) return before;

  const after = await prisma.user.update({
    where: { id: opts.userId },
    data: { active: false },
  });
  await revokeUserSessions(opts.userId);

  await writeAudit(prisma, {
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    action: "USER_DEACTIVATE",
    entity: "User",
    entityId: opts.userId,
    before: { active: true },
    after: { active: false },
  });

  return after;
}

/** Update a user's login email. Refused if another user already has it. */
export async function adminUpdateUserEmail(opts: {
  tenantId: string;
  actorId: string;
  userId: string;
  email: string;
}) {
  const email = opts.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new AppError("VALIDATION", "Enter a valid email address.");
  }
  const user = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, id: opts.userId },
  });
  if (!user) throw new AppError("NOT_FOUND", "User not found.");
  await assertMayManageLogin(opts.tenantId, opts.actorId, user);

  const dupe = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, email, id: { not: opts.userId } },
    select: { id: true },
  });
  if (dupe) throw new AppError("CONFLICT", "Another user already has that email.");

  const after = await prisma.user.update({
    where: { id: opts.userId },
    data: { email },
  });

  await writeAudit(prisma, {
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    action: "USER_UPDATE",
    entity: "User",
    entityId: opts.userId,
    before: { email: user.email },
    after: { email: after.email },
  });

  return after;
}

export async function adminResetPassword(opts: {
  tenantId: string;
  actorId: string;
  userId: string;
  newPassword: string;
}) {
  const user = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, id: opts.userId },
  });
  if (!user) throw new AppError("NOT_FOUND", "User not found.");
  await assertMayManageLogin(opts.tenantId, opts.actorId, user);

  await prisma.user.update({
    where: { id: opts.userId },
    data: { passwordHash: await hashPassword(opts.newPassword), passwordSetAt: new Date() },
  });
  // Old password no longer valid anywhere: sign the user out on every device.
  await revokeUserSessions(opts.userId);

  await writeAudit(prisma, {
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    action: "USER_PASSWORD_RESET",
    entity: "User",
    entityId: opts.userId,
  });
}

/** Admin sets a specific password for a user (min 8 chars).
 *  Separate from adminResetPassword's random-password flow — this one is
 *  for "I want this user's password to be X" scenarios. */
export async function adminSetPassword(opts: {
  tenantId: string;
  actorId: string;
  userId: string;
  newPassword: string;
}) {
  if (opts.newPassword.length < 8) {
    throw new AppError("VALIDATION", "Password must be at least 8 characters.");
  }
  const user = await prisma.user.findFirst({
    where: { tenantId: opts.tenantId, id: opts.userId },
  });
  if (!user) throw new AppError("NOT_FOUND", "User not found.");
  await assertMayManageLogin(opts.tenantId, opts.actorId, user);

  await prisma.user.update({
    where: { id: opts.userId },
    data: { passwordHash: await hashPassword(opts.newPassword), passwordSetAt: new Date() },
  });
  // Old password no longer valid anywhere: sign the user out on every device.
  await revokeUserSessions(opts.userId);

  await writeAudit(prisma, {
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    action: "USER_PASSWORD_SET",
    entity: "User",
    entityId: opts.userId,
  });
}

// Generate a readable but strong temp password (10 chars, letters+digits).
export function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const buf = new Uint8Array(10);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}
