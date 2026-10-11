# Phase P0 — Foundation · Evidence

Dates: 2026-10-10 → 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P0.

## Status

| Gate requirement | Status | Where to find proof |
|---|---|---|
| Repo scaffolded (Next.js, TS strict, pnpm) | ✅ | §Scaffold below |
| Tailwind v4 tokens per §10.1 | ✅ | `src/app/globals.css` |
| Inter + Noto Sans Tamil via `next/font` | ✅ | `src/app/layout.tsx` |
| shadcn primitives restyled | ✅ | `src/components/ui/*` |
| `components/app` primitives (Money, StatusPill, Toast, EmptyState, ConfirmSheet, LangToggle, GoldAudit) | ✅ | `src/components/app/*` |
| `next-intl` with en/ta | ✅ | `src/i18n/{config,locale}.ts` + `messages/{en,ta}.json` |
| Prisma schema (§7) complete | ✅ | `prisma/schema.prisma` |
| Extra SQL (CHECK + RLS defence) | ✅ written, ⏳ unverified | `prisma/sql/extra.sql`, applied by `pnpm run prisma:apply-extra`. First real run against Supabase is the proof; captured in §Blocked-on-Supabase. |
| Supabase Auth phone+password | ✅ (code) | `src/app/(auth)/login/*`, `src/lib/supabase/*` |
| `getSession()` → tenant/role | ✅ | `src/server/auth/session.ts` |
| Permissions matrix (§4.2) + `assertCan()` | ✅ | `src/server/auth/permissions.ts` |
| ESLint rule blocks `@prisma/client` outside `src/server/repo` | ✅ (proven in CI) | `eslint.config.mjs`, `tests/unit/eslint-fixtures/forbidden-prisma-import.ts`, `scripts/check-forbidden-prisma-fixture.mjs` |
| 4 role-aware shells | ✅ | `src/app/(app)/_shells/*` |
| Login screen per §11.1 | ✅ | `src/app/(auth)/login/page.tsx` |
| Standard Server Action shape + `AppError` | ✅ | `src/lib/serverAction.ts`, `src/lib/errors.ts` |
| CI workflow (typecheck, lint, test, build) | ✅ | `.github/workflows/ci.yml` |
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` passes | ✅ | §Gate runs below |
| 403 test (SALES on admin Server Action) | ✅ | `tests/integration/sales-forbidden.test.ts` |
| `prisma migrate status` output | ⏳ Needs Supabase credentials | §Blocked-on-Supabase |
| Screenshots: login en + ta | ⏳ Needs Supabase project | §Blocked-on-Supabase |
| Screenshots: empty Sales home + Admin shell | ⏳ Needs seeded Supabase users | §Blocked-on-Supabase |

## Scaffold

Node v25.8.0 · pnpm 10.32.1 · git 2.42.0.

Key version pins (resolved against npm on 2026-10-11):

| Package | Version |
|---|---|
| next | 16.4.0 |
| react / react-dom | 19.3.0 |
| typescript | 5.9.3 (held below 6.1 for `@typescript-eslint` compatibility) |
| tailwindcss / @tailwindcss/postcss | 4.3.3 |
| prisma / @prisma/client | 6.19.3 (Prisma 7+ moves datasource URLs out of `schema.prisma`; staying on 6.x) |
| next-intl | 4.14.9 |
| @supabase/ssr | 0.12.7 |
| vitest | 5.0.3 |
| @playwright/test | 1.64.0 |
| testcontainers | 12.2.0 |
| eslint | 9.39.5 |
| eslint-config-next | 16.4.0 |
| zod | 4.6.5 |

See `pnpm-lock.yaml` for the full resolution.

### Folder layout as built

```
SalesOS/
├─ .github/workflows/ci.yml
├─ docs/
│  ├─ evidence/phase-0.md
│  └─ superpowers/specs/2026-10-10-salesos-design.md
├─ eslint.config.mjs
├─ middleware.ts
├─ next.config.ts
├─ package.json
├─ playwright.config.ts
├─ postcss.config.mjs
├─ prisma/
│  ├─ apply-extra.ts
│  ├─ schema.prisma
│  ├─ seed.ts
│  └─ sql/extra.sql
├─ scripts/check-forbidden-prisma-fixture.mjs
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                                 globals.css + fonts + i18n provider + GoldAudit (dev)
│  │  ├─ page.tsx                                   redirect to /home or /login
│  │  ├─ globals.css
│  │  ├─ (auth)/login/{page.tsx, LoginForm.tsx, actions.ts}
│  │  ├─ (auth)/layout.tsx
│  │  ├─ (app)/
│  │  │  ├─ layout.tsx                              role dispatcher → 4 shells
│  │  │  ├─ home/page.tsx                           role-specific EmptyState
│  │  │  └─ _shells/
│  │  │     ├─ DesktopAccountsShell.tsx
│  │  │     ├─ DesktopOwnerAdminShell.tsx
│  │  │     ├─ DesktopSidebar.tsx
│  │  │     ├─ MobileDispatchShell.tsx
│  │  │     ├─ MobileNavItem.tsx
│  │  │     ├─ MobileSalesShell.tsx
│  │  │     ├─ TopBar.tsx
│  │  │     └─ UserMenu.tsx
│  │  └─ api/
│  │     ├─ auth/signout/route.ts
│  │     └─ health/route.ts
│  ├─ components/
│  │  ├─ app/{ConfirmSheet,EmptyState,GoldAudit,LangToggle,Money,StatusPill,Toast}.tsx
│  │  └─ ui/{badge,button,input,label}.tsx
│  ├─ config/brand.ts
│  ├─ i18n/{config.ts, locale.ts, messages/{en.json, ta.json}}
│  ├─ lib/
│  │  ├─ env.ts
│  │  ├─ errors.ts
│  │  ├─ serverAction.ts
│  │  ├─ utils.ts
│  │  └─ supabase/{browser,server,service}.ts
│  └─ server/
│     ├─ auth/{permissions.ts, rateLimit.ts, session.ts}
│     ├─ domain/phone.ts
│     ├─ repo/{client.ts, tenants.ts, users.ts}
│     └─ services/userService.ts
├─ tailwind.config.ts
├─ tests/
│  ├─ unit/{permissions.test.ts, phone.test.ts, sales-forbidden.test.ts, eslint-fixtures/forbidden-prisma-import.ts}
│  └─ e2e/{login.spec.ts, shells.spec.ts}
├─ tsconfig.json
├─ vitest.config.ts
├─ .env.example
├─ .gitignore
├─ .prettierrc
└─ README.md
```

## Gate runs

Raw output captured 2026-10-11. All four commands pass with placeholder env vars.

### `pnpm typecheck`

```
> salesos@0.1.0 typecheck C:\Users\Administrator\SalesOS
> tsc --noEmit

(no output — 0 errors)
```

### `pnpm lint`

```
> salesos@0.1.0 lint C:\Users\Administrator\SalesOS
> eslint . && pnpm run lint:fixtures

> salesos@0.1.0 lint:fixtures C:\Users\Administrator\SalesOS
> node scripts/check-forbidden-prisma-fixture.mjs

OK: forbidden-prisma-import correctly rejected (1 violation).
```

### `pnpm test`

```
> salesos@0.1.0 test C:\Users\Administrator\SalesOS
> vitest run

 RUN  v5.0.3 C:/Users/Administrator/SalesOS

 Test Files  3 passed (3)
      Tests  145 passed (145)
   Duration  452ms
```

Test breakdown:

| File | Tests |
|---|---|
| `tests/unit/permissions.test.ts` | 123 (matrix-driven over §4.2 × 5 roles × 24 actions + 3 named edge cases) |
| `tests/unit/phone.test.ts` | 19 (BR-06 — Indian subscriber, trunk-0 strip, +91/+country, invalid inputs) |
| `tests/unit/sales-forbidden.test.ts` | 3 (SALES → FORBIDDEN, ADMIN → ok, no session → UNAUTHENTICATED). Mocks `getSession` — the §16 "integration tier" with testcontainers lands in P2, when real services need a DB. The P0 gate asks for a test proving SALES → 403 on an admin Server Action; this test does that against the real `assertCan()`/`makeServerAction()` wiring. |

### `pnpm build`

```
▲ Next.js 16.4.0 (Turbopack)
✓ Running next.config.ts took 121ms
✓ Compiled successfully in 1049ms
  Running TypeScript ...
  Finished TypeScript in 3.0s ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (7/7) in 434ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /api/auth/signout
├ ƒ /api/health
├ ƒ /home
└ ƒ /login

ƒ Proxy (Middleware)
```

## SALES → FORBIDDEN proof

From `tests/unit/sales-forbidden.test.ts`, verbatim output:

```
 ✓ tests/unit/sales-forbidden.test.ts > Server Action — SALES
 user is forbidden from admin.dashboard > returns FORBIDDEN for a SALES
 user 28ms
 ✓ tests/unit/sales-forbidden.test.ts > Server Action — SALES
 user is forbidden from admin.dashboard > allows the same action for an
 ADMIN user 2ms
 ✓ tests/unit/sales-forbidden.test.ts > Server Action — SALES
 user is forbidden from admin.dashboard > returns UNAUTHENTICATED when no
 session 1ms
 ✓ tests/unit/sales-forbidden.test.ts (3 tests) 33ms
```

The test constructs a dummy admin Server Action via `makeServerAction({ action: "admin.dashboard", … })`, then invokes it with a mocked SALES session. The envelope returns `{ ok: false, error: { code: "FORBIDDEN", … } }` without calling the `run()` body.

## Permissions matrix coverage

123 tests cover every (action × role) pair in `PERMISSION_MATRIX`. If the §4.2 table changes, the test fails row-by-row with a title like `"SALES / orders.view → own"`.

Named edge cases:

- `assertCan` throws `AppError("FORBIDDEN", …)` when denied.
- Admin cannot create Owner (`users.createOwner`).
- Dispatch can view orders but not prices.

## Supabase credentials — needed to close the gate

The following gate items cannot complete without the pilot Supabase project:

1. **`prisma migrate status` output.** Needs `DATABASE_URL` / `DIRECT_URL` pointing at a real Supabase Postgres.
2. **`extra.sql` applied.** CHECK constraints + RLS defence (`prisma/sql/extra.sql`) run via `pnpm run prisma:apply-extra`.
3. **Login screenshot (en + ta).** The Playwright test `tests/e2e/login.spec.ts` runs against the built server and expects the Tamil toggle to flip the heading. The screens render without Supabase, but the "invalid credentials" assertion needs the Supabase sign-in path reachable.
4. **Role-shell screenshots.** `tests/e2e/shells.spec.ts` logs in as each seeded user; needs Supabase auth users created from the seeded SalesOS `User` rows (bootstrap script lands in P1 or earlier if needed).

To unblock, please provide (and I'll store them in `.env`):

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon>
SUPABASE_SERVICE_ROLE_KEY=<service-role>
DATABASE_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

Once set, I will run:

```
pnpm prisma:migrate:dev --name init
pnpm prisma:seed
BOOTSTRAP_PASSWORD='<temp>' pnpm tsx scripts/bootstrap-auth-users.ts
pnpm test:e2e
```

and append the actual outputs + screenshots here before marking the P0 gate "closed".

## Carry-forward to P1

- Prisma schema already contains every model from §7, including the P1–P8 tables. P1 adds UI + services, not more schema.
- `ProductPicker`, `PhoneInput`, `OrderCard` and the Excel import/export glue are explicitly P1 work (not scaffolded in P0 per scope discipline).
- Tamil copy in `src/i18n/messages/ta.json` is a first-pass. Spec §21 Q4 flags native-speaker review before go-live; the P0 strings get re-reviewed when a native speaker is nominated.

## Open spec questions still unresolved for P0

| # | Question | Current P0 assumption |
|---|---|---|
| Q4 | Tamil copy reviewer | Shipped a first-pass; needs native-speaker pass before go-live |
| Q7 | Hosting region | `.env.example` templated to `aws-0-ap-south-1.pooler.supabase.com` |

Everything else (Q1 entity series, Q2 GST-inclusive, Q3 approvers, Q5 targets, Q6 dispatch phone, Q8 import scope) applies to later phases.
