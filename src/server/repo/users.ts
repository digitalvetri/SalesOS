import { prisma, type Role, type Lang } from "./client";

export type SessionUser = {
  id: string;
  tenantId: string;
  authUserId: string;
  name: string;
  phoneE164: string;
  role: Role;
  lang: Lang;
  active: boolean;
  defaultEntityId: string | null;
};

export type UserListRow = {
  id: string;
  name: string;
  phoneE164: string;
  role: Role;
  lang: Lang;
  active: boolean;
  canReceivePayments: boolean;
  defaultEntityId: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

export async function listUsers(tenantId: string): Promise<UserListRow[]> {
  return prisma.user.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      phoneE164: true,
      role: true,
      lang: true,
      active: true,
      canReceivePayments: true,
      defaultEntityId: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
}

export async function getUserById(tenantId: string, userId: string) {
  return prisma.user.findFirst({ where: { tenantId, id: userId } });
}

export async function findUserByAuthId(authUserId: string): Promise<SessionUser | null> {
  const u = await prisma.user.findUnique({
    where: { authUserId },
    select: {
      id: true,
      tenantId: true,
      authUserId: true,
      name: true,
      phoneE164: true,
      role: true,
      lang: true,
      active: true,
      defaultEntityId: true,
    },
  });
  return u;
}

export async function touchLastLogin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}
