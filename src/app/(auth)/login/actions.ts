"use server";
import { headers } from "next/headers";
import { ZodError, z } from "zod";
import { prisma } from "@/server/repo/client";
import { checkLoginRateLimit, noteLoginAttempt } from "@/server/auth/rateLimit";
import { touchLastLogin } from "@/server/repo/users";
import { verifyPassword, verifyAgainstDummy } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { AppError, isAppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/serverAction";

const Input = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1),
});

export async function signInAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const parsed = Input.parse(raw);
    const email = parsed.email.toLowerCase();
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "0.0.0.0";

    // Rate limit keyed off the email+IP combo. (The underlying ledger column is
    // still `phoneE164`; we repurpose it as a generic identity bucket so we
    // don't need a migration just for this.)
    try {
      await checkLoginRateLimit({ phoneE164: email, ip });
    } catch {
      throw new AppError("RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
    }

    // Email is the login identity (unique per tenant; one tenant per deploy).
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, active: true, passwordHash: true },
    });
    const ok = user ? await verifyPassword(parsed.password, user.passwordHash) : await verifyAgainstDummy(parsed.password);
    if (!user || !ok) {
      await noteLoginAttempt({ phoneE164: email, ip, success: false });
      throw new AppError("INVALID_CREDENTIALS", "Email or password is wrong.");
    }
    if (!user.active) {
      await noteLoginAttempt({ phoneE164: email, ip, success: false });
      throw new AppError("DEACTIVATED", "Your account is turned off. Contact your admin.");
    }

    await createSession(user.id, { ip, userAgent: hdrs.get("user-agent") ?? undefined });
    await noteLoginAttempt({ phoneE164: email, ip, success: true });
    await touchLastLogin(user.id);
    return { ok: true, data: { ok: true } };
  } catch (e) {
    if (e instanceof ZodError) {
      return {
        ok: false,
        error: { code: "VALIDATION", message: "Please check the form and try again." },
      };
    }
    if (isAppError(e)) {
      return { ok: false, error: { code: e.code, message: e.userMessage, meta: e.meta } };
    }
    console.error("[signInAction]", e);
    return { ok: false, error: { code: "INTERNAL", message: "Something went wrong." } };
  }
}
