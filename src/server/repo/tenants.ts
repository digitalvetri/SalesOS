import { prisma } from "./client";

export async function getTenantById(tenantId: string) {
  return prisma.tenant.findUnique({ where: { id: tenantId } });
}

export async function getTenantSettings(tenantId: string) {
  return prisma.tenantSettings.findUnique({ where: { tenantId } });
}

export async function recordLoginAttempt(opts: {
  phoneE164: string;
  ip: string;
  success: boolean;
}): Promise<void> {
  await prisma.loginAttempt.create({ data: opts });
}

export async function countRecentLoginFailures(opts: {
  phoneE164: string;
  ip: string;
  windowMs: number;
}): Promise<number> {
  const since = new Date(Date.now() - opts.windowMs);
  return prisma.loginAttempt.count({
    where: {
      success: false,
      at: { gte: since },
      OR: [{ phoneE164: opts.phoneE164 }, { ip: opts.ip }],
    },
  });
}
