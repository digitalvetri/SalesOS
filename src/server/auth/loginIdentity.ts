// What the sign-in box was typed as: a username (default) or an email (still accepted).
import { looksLikeEmail, normalizeUsername } from "@/server/domain/auth/username";

export function resolveLoginWhere(identity: string): { email: string } | { username: string } {
  return looksLikeEmail(identity) ? { email: identity.trim().toLowerCase() } : { username: normalizeUsername(identity) };
}
