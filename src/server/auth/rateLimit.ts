// Login rate limit: 5 failed attempts / 10 min per phone+IP (spec §14).
// Backed by the LoginAttempt table so it survives restarts and works in CI.
import { countRecentLoginFailures, recordLoginAttempt } from "@/server/repo/tenants";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;

export async function checkLoginRateLimit(opts: {
  phoneE164: string;
  ip: string;
}): Promise<void> {
  const failures = await countRecentLoginFailures({
    phoneE164: opts.phoneE164,
    ip: opts.ip,
    windowMs: WINDOW_MS,
  });
  if (failures >= MAX_FAILURES) {
    const err = new Error("RATE_LIMITED");
    err.name = "RATE_LIMITED";
    throw err;
  }
}

export async function noteLoginAttempt(opts: {
  phoneE164: string;
  ip: string;
  success: boolean;
}): Promise<void> {
  await recordLoginAttempt(opts);
}
