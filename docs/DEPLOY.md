# Deploying SalesOS (Vercel + Supabase)

Checked 2026-10-13. `pnpm build` passes and the production server passes the role/route audit and the order-flow checks.

## 1. Supabase (production project)
1. Create a project in **ap-south-1 (Mumbai)**.
2. Auth → Providers → Email: **turn off sign-ups**. Users are created by the admin or by scripts.
3. Auth → URL Configuration: set **Site URL** and **Redirect URLs** to your production domain.
4. Copy from Project Settings → API: the URL, the `anon` key and the `service_role` key.
5. Copy from Connect:
   - the **Transaction pooler** string (port 6543)
   - the **Direct** string (port 5432)

## 2. Database (run once, from your machine, with production env exported)
```bash
export DATABASE_URL="<pooler url>?pgbouncer=true&connection_limit=1"
export DIRECT_URL="<direct url>"
pnpm db:deploy                      # prisma migrate deploy + prisma/sql/extra.sql (RLS, CHECKs)
tsx prisma/seed.ts                  # tenant, billing entities, users (edit names/phones first)
BOOTSTRAP_PASSWORD='<strong temp password>' tsx scripts/bootstrap-auth-users.ts
```
- If you import existing orders, run `node scripts/v1-1-backfill.mjs --commit` afterwards. It seeds the per-employee S.No counters.
- Never run `prisma/seed-demo.ts` against production.

## 3. Vercel
1. Import the Git repo. Framework: **Next.js**, Node **22**. The region `bom1` comes from `vercel.json`.
2. Add these Environment Variables for **Production**, and for **Preview** pointed at a separate database:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API → URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role key (keep secret) |
| `DATABASE_URL` | pooler URL + `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | direct URL (port 5432) |
| `APP_ENCRYPTION_KEY` | a **new** value from `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` |

3. Deploy. `pnpm build` runs `prisma generate && next build`.
4. Check `https://<your-domain>/api/health`. It should return `{"ok":true,"db":"up"}`.

## 4. Before the first Git commit
- `.env.local` is git-ignored. Keep it that way, and never upload it.
- No passwords are hard-coded anymore. Scripts read `BOOTSTRAP_PASSWORD`, `LOGIN_EMAIL` and `LOGIN_PASSWORD` from the environment.
- If the old shared pilot password (`Sales@…2026`) was ever used on a real account, **change it**.
