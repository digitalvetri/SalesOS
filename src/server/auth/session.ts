// Session resolution: Supabase auth user → SalesOS User (tenantId, role).
// Called by every Server Action via assertCan().
import { supabaseServer } from "@/lib/supabase/server";
import { findUserByAuthId, type SessionUser } from "@/server/repo/users";
import { AppError } from "@/lib/errors";

export type Session = {
  user: SessionUser;
  tenantId: string;
  role: SessionUser["role"];
  userId: string;
};

export async function getSession(): Promise<Session | null> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  const user = await findUserByAuthId(data.user.id);
  if (!user) return null;
  if (!user.active) {
    throw new AppError("DEACTIVATED", "Your account is turned off. Contact your admin.");
  }
  return { user, tenantId: user.tenantId, role: user.role, userId: user.id };
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AppError("UNAUTHENTICATED", "Sign in required.");
  return s;
}
