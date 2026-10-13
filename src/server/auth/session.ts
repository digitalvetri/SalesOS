// Own session auth (replaces Supabase Auth). The browser holds a random token
// in an httpOnly cookie; the database keeps only sha256(token) in "Session".
// getSession() is memoised per request, so layouts + pages + actions share one lookup.
import { cache } from "react";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/repo/client";
import { SESSION_USER_SELECT, type SessionUser } from "@/server/repo/users";
import { AppError } from "@/lib/errors";

export type Session = {
  user: SessionUser;
  tenantId: string;
  role: SessionUser["role"];
  userId: string;
};

export const SESSION_COOKIE = "salesos_session";
const SESSION_DAYS = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
// Secure cookies only over HTTPS (an http:// deploy would otherwise drop the cookie).
const secureCookie = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");

/** Create a session for `userId` and set the cookie. Call from Server Actions / Route Handlers. */
export async function createSession(userId: string, meta: { ip?: string; userAgent?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId,
      expiresAt,
      ip: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie(),
    path: "/",
    expires: expiresAt,
  });
}

/** Sign out: delete this browser's session row and clear the cookie. */
export async function destroyCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** Log a user out everywhere (password change, deactivation). Optionally keep the caller's session. */
export async function revokeUserSessions(userId: string, opts: { keepCurrent?: boolean } = {}) {
  let keepId: string | undefined;
  if (opts.keepCurrent) {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    keepId = token ? hashToken(token) : undefined;
  }
  await prisma.session.deleteMany({ where: { userId, ...(keepId ? { id: { not: keepId } } : {}) } });
}

const loadSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    select: { expiresAt: true, user: { select: SESSION_USER_SELECT } },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  const user = row.user;
  if (!user.active) {
    throw new AppError("DEACTIVATED", "Your account is turned off. Contact your admin.");
  }
  return { user, tenantId: user.tenantId, role: user.role, userId: user.id };
});

export async function getSession(): Promise<Session | null> {
  return loadSession();
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
  return s;
}
