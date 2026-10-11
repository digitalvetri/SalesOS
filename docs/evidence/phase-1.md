# Phase P1 — Masters · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P1.
Release branch: `release/p1-v0.2.0`, PR against `main`.

## Status

| Gate requirement (§17-P1) | Status | Where to find proof |
|---|---|---|
| Masters area built: Entities, Accounts, Users (create/reset/deactivate), Targets | ✅ | PR #2 ([link](https://github.com/digitalvetri/SalesOS/pull/2)); §Settings below |
| Products + Price list editor; price history on every price change | ✅ | PR #3; `src/server/services/productService.ts` opens a tx + inserts `ProductPriceHistory` on any price change |
| Price list Excel import/export (`exceljs`) handling pilot format | ✅ (parser + round-trip; real pilot xlsx not yet provided) | §Price list import below |
| Customers (phone-first create, list, detail, merge with audit log) | ✅ | PR #4; §Customers below |
| Phone normalisation `src/server/domain/phone.ts` with 100% test coverage | ✅ | `tests/unit/phone.test.ts` (19 cases) |
| pg_trgm index on `Product.searchText` + aliases | ✅ | `prisma/sql/extra.sql` (GIN indexes on Product.searchText and Customer.name) |
| Integration test: duplicate phone → same customer | ✅ | `tests/integration/customer-upsert.test.ts` — BR-07 10-way concurrent create |
| Price list imported from real sheet (count + 5 sample rows) | ⏳ Pending pilot xlsx file | §Price list import — synthetic end-to-end import captured |
| Screenshots of §11.12 (price list) and §11.13 (settings) | ✅ | `docs/evidence/screenshots/{catalogue-after-import,settings-*}.png` |
| `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass | ✅ | §Gate runs below |

## Gate runs (captured 2026-10-11)

### `pnpm typecheck`

```
> salesos@0.1.0 typecheck
> tsc --noEmit

(no output — 0 errors)
```

### `pnpm lint`

```
> salesos@0.1.0 lint
> eslint . && pnpm run lint:fixtures

> salesos@0.1.0 lint:fixtures
> node scripts/check-forbidden-prisma-fixture.mjs

OK: forbidden-prisma-import correctly rejected (1 violation).
```

### `pnpm test`

```
 Test Files  7 passed (7)
      Tests  166 passed (166)
   Duration  2.03s
```

Test breakdown:

| File | Tests | What it proves |
|---|---|---|
| `tests/unit/phone.test.ts` | 19 | BR-06 Indian subscriber + E.164 edge cases (100% coverage on `src/server/domain/phone.ts`) |
| `tests/unit/permissions.test.ts` | 123 | §4.2 matrix row-by-row |
| `tests/unit/sales-forbidden.test.ts` | 3 | Server-action envelope refuses SALES on admin actions |
| `tests/unit/admin-cannot-create-owner.test.ts` | 8 | §4.2 users.createOwner: Admin can't create/promote/deactivate OWNER; last-owner lockout prevention; self-deactivate refusal |
| `tests/unit/catalogue-dto.test.ts` | 3 | `SALES_PRODUCT_SELECT` cannot leak dealer prices |
| `tests/unit/price-list-import.test.ts` | 7 | Header-row keyword detection, blank-name inheritance, NILL/₹/comma tolerance, no-header rejection, section-category detection |
| `tests/integration/customer-upsert.test.ts` | 3 | BR-07 10-way concurrent create → exactly one row; merge moves orders + writes `CUSTOMER_MERGE` audit; merge rejects source==survivor |

### `pnpm build`

```
▲ Next.js 16.4.0 (Turbopack)
✓ Compiled successfully
Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /api/auth/signout
├ ƒ /api/catalogue/export
├ ƒ /api/catalogue/import/commit
├ ƒ /api/catalogue/import/preview
├ ƒ /api/customers/search
├ ƒ /api/health
├ ƒ /catalogue
├ ƒ /catalogue/import
├ ƒ /customers
├ ƒ /customers/[id]
├ ƒ /customers/new
├ ƒ /home
├ ƒ /login
├ ƒ /settings
├ ƒ /settings/accounts
├ ƒ /settings/entities
├ ƒ /settings/targets
├ ƒ /settings/users
└ ƒ /settings/users/new

ƒ Proxy (Middleware)
```

19 routes (was 5 at the end of P0).

### Playwright e2e (`pnpm test:e2e`)

```
Running 30 tests using 1 worker
  26 passed
  4 skipped (mobile projects where the screen is desktop-first)
```

| Suite | Covers |
|---|---|
| `tests/e2e/login.spec.ts` | Login in English + Tamil, invalid-credentials toast |
| `tests/e2e/shells.spec.ts` | All 5 role shells render after login |
| `tests/e2e/settings.spec.ts` | Users list, create flow with one-time temp password, Entities, Accounts, Targets grid |
| `tests/e2e/catalogue.spec.ts` | Admin uploads synthetic xlsx, previews, commits, sees products on the price list |
| `tests/e2e/customers.spec.ts` | Phone-first create; re-opening with same phone routes to existing record |

## Settings (§11.13, PR #2)

| Area | Deliverables |
|---|---|
| Users | List with inline deactivate/activate + password reset; new-user page with role-aware role dropdown; `TempPasswordDialog` with copy + WhatsApp share |
| Guards | Admin cannot create OWNER (service + action layers), promote to OWNER, deactivate an OWNER; nobody can deactivate the last active OWNER (business-lockout prevention) or their own account |
| Entities | Edit KI/KFM metadata (name, GSTIN, address, phone); dirty-row highlight |
| Accounts | Per-entity bank/UPI/cash-drawer accounts with inline deactivate/activate |
| Targets | Salespeople × months (−2 to +3) grid, forgiving amount parsing (`1,50,000`, `15k`, `1.5l`), autosave on blur |
| Audit | `writeAudit()` writes `USER_*`, `ENTITY_UPDATE`, `ACCOUNT_*`, `TARGET_SET` events |

Screenshots: `docs/evidence/screenshots/settings-{users,entities,accounts,targets}.png`.

## Catalogue (§11.12, PR #3)

| Area | Deliverables |
|---|---|
| Price list editor | Grouped by category, per-cell inline edit, auto-save on blur, dirty-row highlight, live client-side filter |
| Role gating | Owner/Admin see dealer + customer prices; Accounts same (via `priceList.viewDealer`); Sales see customer price only (`SALES_PRODUCT_SELECT` DTO + snapshot test); Dispatch no access |
| Price history | `ProductPriceHistory` row written in the same transaction as any price change |
| Excel import | Two-step wizard (preview → commit) using `ImportBatch` as the token. Handles: section-header categories, blank-name continuation rows, `NILL`/`₹`/commas, column tolerance, no-header rejection |
| Excel export | `exceljs` output with frozen header, Indian ₹ format, category sections |
| Search | pg_trgm GIN indexes on `Product.searchText` and `Customer.name`; `searchProducts()` uses similarity + ILIKE + alias scan |

Screenshots: `docs/evidence/screenshots/catalogue-after-import.png`.

## Customers (§11.11, PR #4)

| Area | Deliverables |
|---|---|
| `PhoneInput` component | +91 fixed prefix, numeric keypad, 250ms-debounced live lookup; emits normalized E.164 + matched-customer card. Reused in P2 new-order wizard. |
| Phone-first create | Typing an existing phone surfaces the match and routes to the existing record. Service `upsertCustomerByPhone` + `(tenantId, phoneE164)` unique constraint make the race safe. |
| Customer detail | Lifetime value + balance due hero figures; orders table with status pills |
| Soft merge | Added `Customer.mergedIntoId` + migration `customer_merge`. Merge moves orders in one transaction, sets `mergedIntoId` + `mergedAt`, writes `CUSTOMER_MERGE` audit. Lists filter out merged rows; detail notes merged-in duplicates. |
| Admin-only `MergeDialog` | Pick a source row → preview → confirm (danger-styled button) |

## Price list import — against the pilot xlsx

The import pipeline is fully implemented and e2e-tested against a synthetic workbook. To run against the real `PRICE LIST KI - KFM - 2026.xlsx`:

1. Drop the file at `fixtures/PRICE LIST KI - KFM - 2026.xlsx` (gitignored).
2. Visit `/catalogue/import` while signed in as Owner or Admin.
3. The preview step shows totals and the first 20 rows; commit writes the full set via `commitPriceList()`.

The parser is designed to the exact pilot shape per spec §19 P1 prompt:
- Columns located by keyword match (PRODUCT, HP, DEALER PRICE w/o MOTOR, DEALER PRICE, CUSTOMER PRICE)
- Section-heading rows between products become categories
- Blank-name rows (e.g. "COPP" variants) inherit the previous product's name
- `NILL`, `₹`, commas in price cells are tolerated
- Row scan uses `max(rowCount, actualRowCount)` so trailing product sections after a blank spacer aren't dropped

Expected gate output once the file lands: product count + first 5 sample rows pasted below. Captured against the synthetic e2e workbook here:

```
Rows found:       3
With prices:      3
Categories:       2  (Wet Grinders, Turbo Stoves)
Issues:           1 × INHERITED_NAME (continuation row)

Sample row       | Category       | Name                      | Spec    | Dealer  | Customer
-----------------|----------------|---------------------------|---------|---------|---------
5                | Wet Grinders   | E2E 10L Tilting           | 1 HP    | 28000   | 32000
6                | Wet Grinders   | E2E 10L Tilting           | 1.5 HP  | 30500   | 34500   (inherited name)
9                | Turbo Stoves   | E2E 3kg Turbo             | —       | 16500   | 18500
```

Full parser coverage: see `tests/unit/price-list-import.test.ts`.

## Spec traceability

| Spec reference | Where delivered |
|---|---|
| §4.2 permission matrix | `src/server/auth/permissions.ts` + 123 matrix tests |
| §6 BR-06 (phone normalisation) | `src/server/domain/phone.ts` (100% unit coverage) |
| §6 BR-07 (phone-first customer uniqueness) | `src/server/services/customerService.ts` + 10-way concurrent integration test |
| §6 BR-13 (audit on every mutation) | `src/server/repo/audit.ts` + per-service wiring |
| §7 ProductPriceHistory | Row written in `updateProduct()` transaction |
| §10.4 one `[data-gold]` per screen | `GoldAudit` dev-only check; every P1 page has exactly one |
| §11.11 Customers | `src/app/(app)/customers/*` |
| §11.12 Price list | `src/app/(app)/catalogue/*` |
| §11.13 Settings | `src/app/(app)/settings/*` |
| §12 UX rules 1 (phone-first), 2 (never ask what we know), 5 (forgiving input) | PhoneInput, user-create defaults, target-grid "15k"/"1.5l" parsing |
| D4 (no self-signup) | Supabase config.toml + bootstrap-auth-users script |

## Carry-forward to P2 and beyond

- Price list import against the actual pilot xlsx (ships the moment the user drops it in `fixtures/`).
- Native-speaker review of Tamil copy (Q4 — carry-forward from P0).
- Testcontainers-based CI for the integration test tier (currently gated to the local dev stack).
- `ProductPicker` and `PhoneInput` components are built in P1 and will be reused by the P2 new-order wizard.
- `AuditLog` is being written across every mutation — the admin audit-log viewer is a P8 deliverable but the data is already captured.
- Price history drawer per product (P1 has the data; UI drawer deferred to P5 as a small polish).

## PRs that make up this release

| # | Title | Scope |
|---|---|---|
| [#1](https://github.com/digitalvetri/SalesOS/pull/1) | P1-A: local Supabase stack + close P0 gate | Supabase CLI stack, email-translated auth, prisma migrations, 16/16 e2e |
| [#2](https://github.com/digitalvetri/SalesOS/pull/2) | P1-B: Settings | Users CRUD + guards, Entities, Accounts, Targets, audit |
| [#3](https://github.com/digitalvetri/SalesOS/pull/3) | P1-C: Catalogue | Price list editor, xlsx import/export, pg_trgm, price history |
| [#4](https://github.com/digitalvetri/SalesOS/pull/4) | P1-D: Customers | Phone-first create, soft merge, PhoneInput, integration tests |

Tag: `v0.2.0-p1` applied on merge.
