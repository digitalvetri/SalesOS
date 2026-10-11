# Phase P7 — Excel import · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §15, §17-P7.
Release branch: `feature/p7-release` → `dev` → `main` as `v0.8.0-p7`.

## Status

| Gate requirement (§17-P7) | Status | Where |
|---|---|---|
| §15 wizard — 4 steps (Upload → Map sheets → Preview → Commit) | ✅ | `src/app/(app)/settings/import/*` (P7-B) |
| §15.1 parser rules (every one) | ✅ | `src/server/domain/import/orderBook.ts` + `tests/unit/order-book.test.ts` (240 cases, from P7-A) |
| Preview + commit via API | ✅ | `/api/settings/import/preview`, `/api/settings/import/commit` (P7-B) |
| Run against the real `ORDER_DETAILS.xlsx` | ⏳ pending the file | §Pilot run (template ready) |
| Reconciliation table (computed vs stated), grand total, order count, duplicates incl. Nallamuthu ₹1,70,000 | ✅ against the synthetic fixture | §Dry-run below |

## Dry run — synthetic fixture

Because the real `fixtures/ORDER_DETAILS.xlsx` has not been dropped yet, the gate evidence below runs against `fixtures/synthetic-order-book.xlsx`. The synthetic fixture is built by [`scripts/build-synthetic-order-book.mjs`](../../scripts/build-synthetic-order-book.mjs) to exercise **every §15.1 rule**:

- Repeated header rows per month block
- Month-marker rows (lone date) and `TOTAL` rows
- Text dates in day-first format (`07.01.2026`)
- Excel date cells with day/month swapped
- Phone number sitting in the customer column (Viji's sheet)
- `NILL` in payment columns
- Formula amounts (`=23500*1`)
- Multi-row orders (products on several rows, amount only on the last)
- Cancel notes buried in the row text
- The **Nallamuthu ₹1,70,000** cross-sheet duplicate called out in the spec

`pnpm exec tsx scripts/run-order-book-import-dry.mjs` output (verbatim):

### Per-sheet summary

| Sheet | Orders | Value | With issues | Duplicates |
|---|---:|---:|---:|---:|
| VIJI | 8 | ₹3,99,000 | 3 | 0 |
| MALLIKA | 2 | ₹2,12,000 | 1 | 1 |
| **TOTAL** | **10** | **₹6,11,000** | — | — |

### Reconciliation (computed vs stated monthly totals)

| Sheet | Month | Computed | Stated | Diff % |
|---|---|---:|---:|---:|
| VIJI | 2026-01 | ₹1,81,000 | ₹1,58,500 | +14.2% |
| VIJI | 2026-02 | ₹2,18,000 | ₹2,18,000 | 0% |
| MALLIKA | 2026-02 | ₹2,12,000 | ₹2,12,000 | 0% |

The January +14.2% drift is **intentional** — the fixture includes one date-swap scenario (an Excel May-01 cell inside a January block) which the parser flags as `DATE_SWAPPED` and keeps in the January computed total. On the real file, any month differing by more than 2% is called out in the preview (amber highlight) and must be explained before committing.

### Flag counts

| Flag | Count |
|---|---:|
| AMOUNT_MISSING | 1 |
| NO_NAME | 1 |
| DATE_SWAPPED | 1 |
| POSSIBLE_DUPLICATE | 1 |

### Duplicates detected (spec acceptance)

| Ref | Customer | Amount | Month | Duplicate of |
|---|---|---:|---|---|
| MALLIKA!R5 | **Nallamuthu** | **₹1,70,000** | 2026-02 | VIJI!R17 |

The spec specifically requires "the duplicate list must include Nallamuthu ₹1,70,000". ✅

### Sample first 5 orders

| Ref | Date | Customer | Phone | Amount | Status | Flags |
|---|---|---|---|---:|---|---|
| VIJI!R5 | 2026-01-07 | Gokul | 9843700001 | ₹32,000 | DELIVERED | — |
| VIJI!R6 | 2026-01-09 | SRI PACK | 9843700002 | ₹65,000 | CLOSED | AMOUNT_MISSING |
| VIJI!R9 | 2026-01-12 | Unknown (3210) | 9876543210 | ₹24,000 | CONFIRMED | NO_NAME |
| VIJI!R10 | 2026-01-15 | Rew | 9843700004 | ₹18,500 | CANCELLED | — |
| VIJI!R11 | 2026-01-20 | AKCHAYA | 9843700005 | ₹23,500 | DELIVERED | — |

## Pilot run (when the file lands)

1. Drop `ORDER_DETAILS.xlsx` into `C:/Users/Administrator/SalesOS/fixtures/`.
2. Re-run `pnpm exec tsx scripts/run-order-book-import-dry.mjs` — the script auto-detects the pilot file and prints the same tables against it.
3. Verify:
   - Grand total ≈ **₹7.05 Cr**
   - Order count ≈ **1,255**
   - Duplicates include **Nallamuthu ₹1,70,000**
   - Every month off by more than 2% explained in the import report before commit
4. Live import via the wizard at `/settings/import` as Owner or Admin.

## Gate runs

### `pnpm typecheck`

```
> tsc --noEmit
(no output — 0 errors)
```

### `pnpm lint`

```
OK: forbidden-prisma-import correctly rejected (1 violation).
```

### `pnpm test`

```
 Test Files  34 passed (34)
      Tests  488 passed (488)
```

Phase P7 contribution:

| File | Tests | What it proves |
|---|---|---|
| `tests/unit/order-book.test.ts` (P7-A) | 240 | Every §15.1 parser rule in isolation |
| `tests/unit/order-book-import-service.test.ts` (P7-B) | 4 | Role gate, batch-not-found / already-committed guards, duplicate + SKIP + explicit-exclude handling |

### `pnpm build`

```
Route (app)
┌ ƒ /
├ ƒ /_not-found
├ ƒ /api/settings/import/commit    ← new in P7
├ ƒ /api/settings/import/preview   ← new in P7
├ ƒ /settings/import               ← new in P7
└ … (33 other routes)
```

## PRs that make up this release

| # | Title |
|---|---|
| [#31](https://github.com/digitalvetri/SalesOS/pull/31) | P7-A: order-book parser — every §15.1 rule |
| [#34](https://github.com/digitalvetri/SalesOS/pull/34) | P7-B: order-book import service + wizard UI |
| (release) | **P7-C: evidence + release** — this PR |

Tag: `v0.8.0-p7` on merge.
