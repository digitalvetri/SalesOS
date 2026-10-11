// Supabase phone auth needs an active SMS provider (real $$). We present mobile+
// password in the UI (spec D4) but internally use the email provider with a
// synthetic address derived from the phone number: `<digits>@phone.salesos.local`.
//
// Admin flows are identical to real phone auth: admin.createUser receives an
// email, phone is stored as metadata, and the SalesOS User row carries the real
// phoneE164. Sign-in computes the same email from the user-entered phone.
import type { NormalizedPhone } from "@/server/domain/phone";

const AUTH_EMAIL_DOMAIN = "phone.salesos.local";

export function phoneToSyntheticEmail(e164: string): string {
  const digits = e164.replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) {
    throw new Error("phoneToSyntheticEmail: expected E.164 digits");
  }
  return `${digits}@${AUTH_EMAIL_DOMAIN}`;
}

export function phoneToSyntheticEmailFromNormalized(p: NormalizedPhone): string {
  return phoneToSyntheticEmail(p.e164);
}
