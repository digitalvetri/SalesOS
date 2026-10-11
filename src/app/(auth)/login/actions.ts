"use server";
import { headers } from "next/headers";
import { ZodError, z } from "zod";
import { supabaseServer } from "@/lib/supabase/server";
import { prisma } from "@/server/repo/client";
import { checkLoginRateLimit, noteLoginAttempt } from "@/server/auth/rateLimit";
import { findUserByAuthId, touchLastLogin } from "@/server/repo/users";
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

    // Find the user by email first so we can authenticate against whatever email
    // Supabase stores for them (which may differ from User.email during a
    // migration window — Supabase email is the ground truth for auth).
    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, active: true, authUserId: true },
    });

    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: parsed.password,
    });

    if (error || !data.user) {
      await noteLoginAttempt({ phoneE164: email, ip, success: false });
      throw new AppError("INVALID_CREDENTIALS", "Email or password is wrong.");
    }

    const sessionUser = user ? await findUserByAuthId(data.user.id) : null;
    if (!sessionUser) {
      await sb.auth.signOut();
      await noteLoginAttempt({ phoneE164: email, ip, success: false });
      throw new AppError("INVALID_CREDENTIALS", "Email or password is wrong.");
    }
    if (!sessionUser.active) {
      await sb.auth.signOut();
      await noteLoginAttempt({ phoneE164: email, ip, success: false });
      throw new AppError("DEACTIVATED", "Your account is turned off. Contact your admin.");
    }

    await noteLoginAttempt({ phoneE164: email, ip, success: true });
    await touchLastLogin(sessionUser.id);
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
