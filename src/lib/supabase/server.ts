// SSR Supabase client. Reads cookies from Next headers; used by Server Components,
// Route Handlers and Server Actions to resolve the current auth user.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function supabaseServer() {
  const store = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options as CookieOptions);
          }
        } catch {
          // Called from a Server Component — Next 15 forbids cookie mutation here.
          // Server Actions / middleware will set them.
        }
      },
    },
  });
}
