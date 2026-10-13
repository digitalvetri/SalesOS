# SalesOS

Order, payment & dispatch CRM for commercial-kitchen and food-processing machinery sellers.

**Single source of truth:** [`docs/superpowers/specs/2026-10-10-salesos-design.md`](docs/superpowers/specs/2026-10-10-salesos-design.md).
If this README disagrees with the spec, the spec wins.

## Local setup

### Prereqs
- Node ≥ 20.11, pnpm 10
- **Docker Desktop running** (local PostgreSQL)

### First-time flow

```bash
pnpm install
pnpm db:up                                   # PostgreSQL 16 on localhost:55433
cp .env.example .env.local                   # then set APP_ENCRYPTION_KEY:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
pnpm prisma:migrate                          # migrations + prisma/sql/extra.sql
pnpm prisma:seed                             # tenant, entities, demo users
pnpm prisma:seed:demo                        # (optional) demo orders/payments
BOOTSTRAP_PASSWORD='Pick-a-temp-password' pnpm bootstrap:auth   # give users a login
pnpm dev                                     # http://localhost:3000
```

Login is email + password, handled by the app itself (scrypt password hashes,
database sessions — see `src/server/auth/`). Seeded users log in as
`<phone digits>@phone.salesos.local`. Change anyone's login with
`pnpm set-login <current-email-or-+91phone> <new-email> <new-password>`.

### Day-to-day

```bash
pnpm db:up && pnpm dev     # start database + app
pnpm db:down               # stop the database (data kept)
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
| `pnpm db:up` / `db:down` | Start / stop local PostgreSQL (Docker) |
| `pnpm db:deploy` | Production: migrations + extra.sql from the shell env |
| `pnpm prisma:migrate:dev` | Create/update DB (dev) + apply `extra.sql` |
| `pnpm prisma:migrate` | Deploy migrations (CI/prod) + apply `extra.sql` |
| `pnpm prisma:seed` | Seed tenant + users |

## Phase gates

Each build phase lands with its own evidence file.

- Phase P0 — Foundation → [`docs/evidence/phase-0.md`](docs/evidence/phase-0.md).
- Phase P1 — Masters → [`docs/evidence/phase-1.md`](docs/evidence/phase-1.md).
- Phase P2 — Orders → [`docs/evidence/phase-2.md`](docs/evidence/phase-2.md).
- Phase P3 — Payments & Collect → [`docs/evidence/phase-3.md`](docs/evidence/phase-3.md).
- Phase P4 — Dispatch → [`docs/evidence/phase-4.md`](docs/evidence/phase-4.md).
- Phase P5 — Dashboard & Reports → [`docs/evidence/phase-5.md`](docs/evidence/phase-5.md).
- Phase P6 — WhatsApp → [`docs/evidence/phase-6.md`](docs/evidence/phase-6.md).
- Phase P7 — Excel import → [`docs/evidence/phase-7.md`](docs/evidence/phase-7.md).

See spec §17 for the full phase plan.

## Branches

- `main` — production. Protected: PR + green CI required.
- `dev` — default. Phase work merges here first.
- `feature/*` — one per task. Branch from `dev`, PR back.
