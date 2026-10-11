// Supabase SSR requires middleware to keep the auth cookies fresh across requests.
// Session gating is enforced inside the `(app)` layout — this middleware stays
// permissive and only refreshes tokens.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Webhook + cron are machine-to-machine: no auth cookies to refresh, keep them fast.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/whatsapp/webhook|api/cron/|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
