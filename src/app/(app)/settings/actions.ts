"use server";
import { z } from "zod";
import Decimal from "decimal.js";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { prisma } from "@/server/repo/client";
import { writeAudit } from "@/server/repo/audit";
import { hashPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/auth/session";

// ─── Default monthly target ─────────────────────────────────────────

const DefaultTargetInput = z.object({ amount: z.string() });

export const setDefaultTargetAction = makeServerAction({
  input: DefaultTargetInput,
  action: "settings.manage",
  revalidate: "/settings",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const d = new Decimal(parsed.amount);
    if (d.isNaN() || d.isNegative()) {
      throw new AppError("VALIDATION", "Enter a number ≥ 0.");
    }
    const before = await prisma.tenantSettings.findUnique({
      where: { tenantId: session.tenantId },
      select: { defaultMonthlyTarget: true },
    });
    const after = await prisma.tenantSettings.update({
      where: { tenantId: session.tenantId },
      data: { defaultMonthlyTarget: d.toFixed(2) },
    });
    await writeAudit(prisma, {
      tenantId: session.tenantId,
      actorId: session.userId,
      action: "SETTINGS_UPDATE",
      entity: "TenantSettings",
      entityId: session.tenantId,
      before: { defaultMonthlyTarget: before?.defaultMonthlyTarget.toString() ?? "0" },
      after: { defaultMonthlyTarget: after.defaultMonthlyTarget.toString() },
    });
    return { amount: after.defaultMonthlyTarget.toString() };
  },
});

// ─── Change my password ─────────────────────────────────────────────

const ChangeMyPasswordInput = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters.").max(100),
});

export const changeMyPasswordAction = makeServerAction({
  input: ChangeMyPasswordInput,
  action: "settings.manage",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash: await hashPassword(parsed.newPassword), passwordSetAt: new Date() },
    });
    // Sign out other devices; this browser stays signed in.
    await revokeUserSessions(session.userId, { keepCurrent: true });
    await writeAudit(prisma, {
      tenantId: session.tenantId,
      actorId: session.userId,
      action: "PASSWORD_SELF_CHANGE",
      entity: "User",
      entityId: session.userId,
    });
    return { ok: true };
  },
});
