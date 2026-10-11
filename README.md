# SalesOS

Order, payment & dispatch CRM for commercial-kitchen and food-processing machinery sellers.

**Single source of truth:** [`docs/superpowers/specs/2026-10-10-salesos-design.md`](docs/superpowers/specs/2026-10-10-salesos-design.md).
If this README disagrees with the spec, the spec wins.

## Local setup

1. **Prereqs**: Node ≥ 20.11, pnpm 10, Docker (for integration tests).
2. **Install**:
   ```bash
   pnpm install
   ```
3. **Env**: copy `.env.example` → `.env` and fill in your Supabase project values. Generate the encryption key with:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
4. **DB — first time** (creates the baseline migration under `prisma/migrations/`):
   ```bash
   pnpm prisma:migrate:dev --name init   # generates + applies migration, then runs extra.sql
   pnpm prisma:seed                      # tenant, entities, accounts, users
   BOOTSTRAP_PASSWORD='Pick-a-temp-password' pnpm tsx scripts/bootstrap-auth-users.ts
   ```
   **Subsequent runs** on existing migrations (CI, teammates, production):
   ```bash
   pnpm prisma:migrate    # migrate deploy + apply-extra
   ```
5. **Run**:
   ```bash
   pnpm dev
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
| `pnpm prisma:migrate:dev` | Create/update DB (dev) |
| `pnpm prisma:migrate` | Deploy migrations (CI/prod) |
| `pnpm prisma:seed` | Seed tenant + users |

## Phase gates

Each build phase lands with its evidence file. Current status:

- Phase P0 — Foundation → see [`docs/evidence/phase-0.md`](docs/evidence/phase-0.md).

See spec §17 for the full phase plan.
