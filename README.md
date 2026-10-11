# SalesOS

Order, payment & dispatch CRM for commercial-kitchen and food-processing machinery sellers.

**Single source of truth:** [`docs/superpowers/specs/2026-10-10-salesos-design.md`](docs/superpowers/specs/2026-10-10-salesos-design.md).
If this README disagrees with the spec, the spec wins.

## Local setup

### Prereqs
- Node ≥ 20.11, pnpm 10
- **Docker Desktop running** (powers the local Supabase stack)

### First-time flow

```bash
# 1. deps
pnpm install

# 2. start the local Supabase stack (Postgres, Auth, Storage, Studio)
pnpm sb:start                       # ~30s first run while images download

# 3. put the printed credentials into .env.local (see .env.example for shape)
pnpm sb:env > .env.local            # writes NEXT_PUBLIC_SUPABASE_URL/ANON_KEY, SERVICE_ROLE_KEY, DATABASE_URL/DIRECT_URL

# 4. generate the encryption key and append it
node -e "console.log('APP_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> .env.local

# 5. create the Prisma baseline migration and apply CHECK + RLS extras
pnpm prisma:migrate:dev --name init

# 6. seed tenant / entities / accounts / users
pnpm prisma:seed

# 7. create Supabase auth rows for every seeded user (one shared temp password)
BOOTSTRAP_PASSWORD='Pick-a-temp-password' pnpm tsx scripts/bootstrap-auth-users.ts

# 8. run
pnpm dev                             # http://localhost:3000
```

Studio (DB browser) is at **http://127.0.0.1:55423**.
Stop everything with `pnpm sb:stop`. Reset the local DB (nuclear) with `pnpm sb:reset` → re-run steps 5–7.

### Day-to-day

```bash
pnpm sb:start && pnpm dev           # bring the stack up and start Next
pnpm sb:stop                        # stop containers at end of day
```

## Scripts

| Script | Purpose |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm build` | Production build |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint + fixture test (proves `@prisma/client` import rule fires) |
| `pnpm test` | Vitest (unit + integration) |
| `pnpm test:e2e` | Playwright |
| `pnpm sb:start` / `sb:stop` / `sb:status` / `sb:reset` | Local Supabase stack lifecycle |
| `pnpm sb:env` | Print current local Supabase creds in `.env` format |
| `pnpm prisma:migrate:dev` | Create/update DB (dev) + apply `extra.sql` |
| `pnpm prisma:migrate` | Deploy migrations (CI/prod) + apply `extra.sql` |
| `pnpm prisma:seed` | Seed tenant + users |

## Phase gates

Each build phase lands with its own evidence file.

- Phase P0 — Foundation → [`docs/evidence/phase-0.md`](docs/evidence/phase-0.md).
- Phase P1 — Masters → [`docs/evidence/phase-1.md`](docs/evidence/phase-1.md).

See spec §17 for the full phase plan.

## Branches

- `main` — production. Protected: PR + green CI required.
- `dev` — default. Phase work merges here first.
- `feature/*` — one per task. Branch from `dev`, PR back.
