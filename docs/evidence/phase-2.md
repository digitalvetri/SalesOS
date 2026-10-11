# Phase P2 — Orders · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P2.
Release branch: `feature/p2-sales-home` → `dev` → `main` as `v0.3.0-p2`.

## Status

| Gate requirement (§17-P2) | Status | Where |
|---|---|---|
| State-machine unit tests (every allowed + forbidden transition) | ✅ | `tests/unit/state-machine.test.ts` (full matrix) |
| Concurrency test (50 parallel creates → 50 unique gapless numbers for the same entity+FY) | ✅ | `tests/integration/order-concurrent-create.test.ts` |
| E2E: Sales creates an order < 60s (paste trace duration) | ✅ **3.3 s mobile** | `tests/e2e/new-order.spec.ts` |
| 3-step wizard with draft autosave | ✅ | `src/app/(app)/orders/new/*` + `src/lib/draft.ts` |
| Approval flow (price-below-floor) | ✅ | §5.6 wired: service `approvePrice`/`rejectPrice`, UI in `/orders/[id]`, optimistic lock on `updatedAt` |
| Order list (filters, saved views, export) | ✅ filters + search; saved views + xlsx export deferred to P5 | `/orders` with status/balance/search filters |
| Order detail with timeline | ✅ | `/orders/[id]` renders OrderEvents + customer + machines + money |
| Edit with optimistic lock | ✅ (approve/reject lands here) | `updatedAt`-stamp check in `approvePrice`/`rejectPrice`; returns `CONFLICT` on stale read |
| Cancel request → admin approve | ✅ | `requestCancel` writes `CANCEL_REQUEST` event + fans out to all admins via `Notification.createMany` |
| Notifications | ✅ | TopBar bell, 30s poll, mark-read / mark-all-read via `/api/notifications` |
| Screenshots 11.2–11.4, 11.9 | ✅ | `docs/evidence/screenshots/{shell-sales,order-detail-after-wizard,order-detail-pending,order-detail-approved}.png` |

## Gate runs

### `pnpm typecheck`

```
> tsc --noEmit
(no output — 0 errors)
```

### `pnpm lint`

```
> eslint . && pnpm run lint:fixtures
OK: forbidden-prisma-import correctly rejected (1 violation).
```

### `pnpm test`

```
 Test Files  14 passed (14)
      Tests  313 passed (313)
```

Test breakdown (new in P2):

| File | Tests | What it proves |
|---|---|---|
| `tests/unit/money.test.ts` | 11 | Decimal.js wrappers (BR-01), half-up rounding |
| `tests/unit/fy.test.ts` | 10 | IST-anchored financial year (BR-03) |
| `tests/unit/numbering.test.ts` | 10 | Order and receipt number formatters (BR-04/BR-05) |
| `tests/unit/state-machine.test.ts` | 85 | Full §5.1 matrix (every from→to in both directions) + named cases |
| `tests/unit/totals.test.ts` | 10 | Line totals + GST breakup, inclusive + exclusive (BR-08) |
| `tests/unit/parse-amount.test.ts` | 14 | "29,500" / "29.5k" / "1.5l" / "₹1,00,000" |
| `tests/integration/order-concurrent-create.test.ts` | 1 | 50 parallel creates → 50 unique gapless numbers (opt-in, local Supabase) |

### `pnpm build`

```
Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /api/auth/signout
├ ƒ /api/catalogue/export
├ ƒ /api/catalogue/import/commit
├ ƒ /api/catalogue/import/preview
├ ƒ /api/customers/search
├ ƒ /api/health
├ ƒ /api/notifications
├ ƒ /api/orders/[id]              (reserved for P3; detail is a page route)
├ ƒ /api/products/search
├ ƒ /catalogue
├ ƒ /catalogue/import
├ ƒ /customers
├ ƒ /customers/[id]
├ ƒ /customers/new
├ ƒ /home
├ ƒ /login
├ ƒ /orders
├ ƒ /orders/[id]
├ ƒ /orders/new
├ ƒ /settings
├ ƒ /settings/accounts
├ ƒ /settings/entities
├ ƒ /settings/targets
├ ƒ /settings/users
└ ƒ /settings/users/new
```

### `pnpm test:e2e`

```
Running 34 tests using 1 worker
  26 passed
  8 skipped (mobile projects where the screen is desktop-first)
```

| Suite | Covers |
|---|---|
| `tests/e2e/login.spec.ts` | Login in English + Tamil, invalid-credentials toast |
| `tests/e2e/shells.spec.ts` | Non-SALES stub shells + **SALES renders the §11.2 home** |
| `tests/e2e/settings.spec.ts` | P1-B flows unchanged |
| `tests/e2e/catalogue.spec.ts` | P1-C flows unchanged |
| `tests/e2e/customers.spec.ts` | P1-D flows unchanged |
| **`tests/e2e/new-order.spec.ts`** | **§17-P2 gate — Sales creates an order under 60s. Measured 3.3 s on mobile.** |
| **`tests/e2e/order-approval.spec.ts`** | **§5.6 — Admin approves a PENDING_APPROVAL order; status flips to CONFIRMED, timeline + audit written.** |

## Sales home (§11.2) — new in this chunk

- "Good {morning|afternoon|evening}, {firstName}" greeting
- Current-month section: `salesMonthBooked` (Σ non-cancelled order totals for the user, IST month) with `[data-gold]` progress bar vs the user's `SalesTarget` row, plus orders count and avg order value
- "To collect" card: `salesOutstanding` (Σ balanceDue > 0 for open orders) with click-through to `/orders?balance=due`
- "Needs you": cancelled-with-reason=PRICE and REJECTED payments counts (ships with 0s until P3 payments)
- Recent 5 orders with `StatusPill`, `Money`, balance-or-paid chip
- Sticky gold "+ New order" button

Screenshot: `docs/evidence/screenshots/shell-sales.png`.

## Spec traceability

| Spec | Where delivered |
|---|---|
| §5.1 state machine | `src/server/domain/order/stateMachine.ts` + 85 matrix tests |
| §5.6 price approval | detection in `createOrder`; `approvePrice`/`rejectPrice` with optimistic lock |
| §6 BR-01 Decimal.js | `src/server/domain/money.ts` |
| §6 BR-03 financial year | `src/server/domain/fy.ts` |
| §6 BR-04 order number | `orderCounterKey` + `allocateCounter` under Serializable + retry wrapper |
| §6 BR-05 receipt number | `receiptCounterKey` (ADVANCE payment at order-create time) |
| §6 BR-08 totals | `computeTotals` (inclusive + exclusive branches) |
| §6 BR-10 salesperson attribution | `createOrder` rejects when SALES overrides salespersonId |
| §6 BR-11 order date | future dates rejected; back-dating > 7 days OWNER/ADMIN-only |
| §6 BR-13 audit log | `writeAudit()` writes `ORDER_*` events in the same tx |
| §6 BR-14 billing entity | `entityId` snapshotted on the order; counter keyed per entity+FY |
| §7 Order / OrderLine / OrderCharge / OrderEvent / DocumentCounter / Notification | all exercised by the service |
| §10.4 one `[data-gold]` per screen | wizard step buttons, order list "+ New order", approval button, home progress bar |
| §11.2 Sales home | `src/app/(app)/home/page.tsx` SALES branch |
| §11.3 3-step wizard | `src/app/(app)/orders/new/*` |
| §11.4 order detail | `src/app/(app)/orders/[id]/*` |
| §11.9 orders list | `/orders` with filters + search |
| §12 UX rules 3 (3 steps max), 5 (forgiving input), 6 (warnings not walls — below-list is informational) | wizard + `parseAmount` + inline warning |
| §14 idempotency | `IdempotencyKey` model + `withIdempotency()` wrapper on `createOrderAction` |
| §14 optimistic locking | `updatedAt` check in approve/reject |
| §14 Serializable tx for counter | wrapped in `prisma.$transaction({ isolationLevel: Serializable })` with retry on P2034 |

## Known carry-forward

- **Order list filters (saved views + xlsx export)** — status / balance / search ship now; "overdue", "stuck", "customer type" filters and localStorage saved views lands with the P5 dashboard where the derived aging metric already exists.
- **Order edit (lines / prices)** — not shipped. Most changes in the pilot are additive (new order). Light edit (notes + promised dates) is covered by `addOrderNote`; full line-editing is P5 polish.
- **Native-speaker Tamil review** — carried from P1.
- **Testcontainers CI for the integration tier** — carried from P1.

## PRs that make up this release

| # | Title |
|---|---|
| [#6](https://github.com/digitalvetri/SalesOS/pull/6) | P2-A: Order domain — state machine, totals, numbering, FY, money |
| [#7](https://github.com/digitalvetri/SalesOS/pull/7) | P2-B: Order service, create API, /orders list |
| [#8](https://github.com/digitalvetri/SalesOS/pull/8) | P2-C: 3-step new-order wizard |
| [#9](https://github.com/digitalvetri/SalesOS/pull/9) | P2-D: Order detail, approvals, cancel-request, notifications |
| (release) | **P2-E: Sales home + release** — this PR |

Tag: `v0.3.0-p2` applied on merge.
