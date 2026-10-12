import { prisma } from "./client";

export async function listMyNotifications(opts: {
  tenantId: string;
  userId: string;
  limit?: number;
}) {
  return prisma.notification.findMany({
    where: { tenantId: opts.tenantId, userId: opts.userId },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 30,
    select: {
      id: true,
      kind: true,
      title: true,
      body: true,
      link: true,
      readAt: true,
      createdAt: true,
    },
  });
}

export async function countUnread(opts: { tenantId: string; userId: string }) {
  return prisma.notification.count({
    where: { tenantId: opts.tenantId, userId: opts.userId, readAt: null },
  });
}

export async function markRead(opts: {
  tenantId: string;
  userId: string;
  id: string;
}) {
  // Scope to the caller: never touch another user's (or tenant's) notification.
  await prisma.notification.updateMany({
    where: { id: opts.id, tenantId: opts.tenantId, userId: opts.userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(opts: { tenantId: string; userId: string }) {
  await prisma.notification.updateMany({
    where: { tenantId: opts.tenantId, userId: opts.userId, readAt: null },
    data: { readAt: new Date() },
  });
}
