"use server";
import { headers } from "next/headers";
import { ZodError, z } from "zod";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import { phoneToSyntheticEmail } from "@/server/auth/phoneToEmail";
import { supabaseServer } from "@/lib/supabase/server";
import { checkLoginRateLimit, noteLoginAttempt } from "@/server/auth/rateLimit";
import { findUserByAuthId, touchLastLogin } from "@/server/repo/users";
import { AppError, isAppError } from "@/lib/errors";
import type { ActionResult } from "@/lib/serverAction";

const Input = z.object({
  phone: z.string().min(3),
  password: z.string().min(1),
});

export async function signInAction(raw: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const parsed = Input.parse(raw);
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      hdrs.get("x-real-ip") ||
      "0.0.0.0";

    let phoneE164: string;
    try {
      phoneE164 = normalizePhone(parsed.phone).e164;
    } catch (e) {
      if (e instanceof PhoneParseError) {
        throw new AppError("INVALID_CREDENTIALS", "Mobile number or password is wrong.");
      }
      throw e;
    }

    try {
      await checkLoginRateLimit({ phoneE164, ip });
    } catch {
      throw new AppError("RATE_LIMITED", "Too many attempts. Try again in a few minutes.");
    }

    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signInWithPassword({
      email: phoneToSyntheticEmail(phoneE164),
      password: parsed.password,
    });

    if (error || !data.user) {
      await noteLoginAttempt({ phoneE164, ip, success: false });
      throw new AppError("INVALID_CREDENTIALS", "Mobile number or password is wrong.");
    }

    const user = await findUserByAuthId(data.user.id);
    if (!user) {
      // Auth user exists but no SalesOS user row — treat as invalid credentials, not deactivated,
      // to avoid confirming that this phone number maps to a known account.
      await sb.auth.signOut();
      await noteLoginAttempt({ phoneE164, ip, success: false });
      throw new AppError("INVALID_CREDENTIALS", "Mobile number or password is wrong.");
    }
    if (!user.active) {
      await sb.auth.signOut();
      await noteLoginAttempt({ phoneE164, ip, success: false });
      throw new AppError("DEACTIVATED", "Your account is turned off. Contact your admin.");
    }

    await noteLoginAttempt({ phoneE164, ip, success: true });
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
