import { prisma, type Role, type Lang } from "./client";

export type SessionUser = {
  id: string;
  tenantId: string;
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
  username: string | null;
  email: string | null;
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
      username: true,
      email: true,
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

export const SESSION_USER_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  phoneE164: true,
  role: true,
  lang: true,
  active: true,
  defaultEntityId: true,
} as const;

export async function touchLastLogin(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}
