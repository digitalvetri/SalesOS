// Service-role Supabase client. Server-side only. Used for admin operations
// (create user, reset password) that bypass RLS. Never import from client code.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverOnlyEnv } from "@/lib/env";

let cached: SupabaseClient | undefined;

export function supabaseService(): SupabaseClient {
  if (cached) return cached;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = serverOnlyEnv();
  cached = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
