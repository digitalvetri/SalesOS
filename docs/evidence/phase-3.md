# Phase P3 — Payments & Collect · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P3 (§5.2, §5.4, BR-05, BR-09, §9 money, §11.5, §11.6, §11.8).
Release: `dev` → `main` as `v0.4.0-p3`.

## Status

| Gate requirement (§17-P3) | Status | Where |
|---|---|---|
| Balance unit tests (BR-09) | ✅ 11 tests, `src/server/domain` at 100 % lines | `tests/unit/balance.test.ts` |
| Integration: verify/reject/refund sequences → exact balances (expected vs actual table) | ✅ 12/12 | `tests/integration/payment-sequences.test.ts` — table below |
| Record payment sheet (§11.5) | ✅ | `src/app/(app)/orders/[id]/RecordPaymentSheet.tsx` |
| Proof upload — private Storage, signed URLs, client compression (1600 px, ~300 KB) | ✅ | `src/server/storage/paymentProofs.ts`, `/api/payments/proof`, `/api/payments/[id]/proof`, `src/lib/compressImage.ts` |
| Verify queue (bulk), reject with mandatory reason | ✅ | `/payments` |
| Cash with staff + mark deposited | ✅ | `/payments/cash` |
| Refunds, receipt numbers (BR-05), balance recompute, CLOSED automation | ✅ | `paymentService` (P3-A) + refund sheet on order detail |
| Collect screen with aging, follow-ups, promised dates | ✅ | `/collect`, `followUpService` |
| E2E: record payment → verify → WhatsApp deep link | ✅ 13.3 s | `tests/e2e/payments.spec.ts` |
| Screenshots 11.5, 11.6, 11.8 | ✅ | `docs/evidence/screenshots/{record-payment-sheet,collect,verify-queue,cash-with-staff,order-detail-payments}.png` |

## Gate runs

All runs below are against the local Supabase stack (`pnpm sb:start`, Postgres 17 on :55422).

### `pnpm typecheck`

```
> tsc --noEmit
(no output — 0 errors)
```

### `pnpm lint`

```
> eslint . && pnpm run lint:fixtures
✖ 2 problems (0 errors, 2 warnings)      # both pre-existing in tests/integration/payment-sequences.test.ts
OK: forbidden-prisma-import correctly rejected (1 violation).
```

### `pnpm test` (with coverage)

```
 Test Files  22 passed (22)
      Tests  384 passed (384)

File              | % Stmts | % Branch | % Funcs | % Lines
All files         |   99.52 |    97.08 |     100 |     100
 domain           |   98.43 |    88.23 |     100 |     100
```

### §17-P3 gate table — `tests/integration/payment-sequences.test.ts`

```
1. pending advance ₹20,000                              expected=     80000/CONFIRMED  actual=     80000/CONFIRMED
2. advance verified                                     expected=     80000/CONFIRMED  actual=     80000/CONFIRMED
3. +part ₹30,000 pending                                expected=     50000/CONFIRMED  actual=     50000/CONFIRMED
4. part rejected ⇒ back to ₹80,000                      expected=     80000/CONFIRMED  actual=     80000/CONFIRMED
5. DELIVERED + pending final (verifiedNet still 20k)    expected=         0/DELIVERED  actual=         0/DELIVERED
6. final verified ⇒ CLOSED                              expected=         0/CLOSED     actual=         0/CLOSED
7. final rejected ⇒ reopen DELIVERED                    expected=     80000/DELIVERED  actual=     80000/DELIVERED
8. overpayment refused — no state change                expected=    100000/CONFIRMED  actual=    100000/CONFIRMED
9. cancelled with ₹25k verified ⇒ refund due            expected=    -25000/CANCELLED  actual=    -25000/CANCELLED
10. refund verified ⇒ balance 0                         expected=         0/CANCELLED  actual=         0/CANCELLED
11. cash-with-staff + deposited (no balance change)     expected=     85000/CONFIRMED  actual=     85000/CONFIRMED
12. bulk-verify 2 payments ⇒ CLOSED                     expected=         0/CLOSED     actual=         0/CLOSED
```

12 / 12 sequences: expected == actual.

### E2E — `pnpm test:e2e` (Pixel 7 + Desktop 1440)

```
  ✓ [desktop] payments.spec.ts › sales records with proof, accounts verifies, cash deposited (13.3s)
  ✓ [mobile]  new-order.spec.ts › Viji picks an existing customer, adds a machine, confirms (4.0s)
  ✓ [desktop] order-approval.spec.ts › admin approves and the order moves to CONFIRMED (3.5s)
  … login, settings, catalogue, customers, shells
  14 skipped   # project-specific (mobile-only / desktop-only) + owner/dispatch passwords not set
  22 passed (1.1m)
```

`payments.spec.ts` walks the whole money loop:
1. Sales (Mallika, mobile) records ₹10,000 UPI with a UTR and a screenshot. The screenshot is compressed in the browser, uploaded to the private `payment-proofs` bucket, and the receipt number is shown.
2. Sales records ₹4,000 cash into "Me". The row shows the "With Mallika" chip, and the balance is 24,000 → 10,000.
3. On Collect, the WhatsApp reminder opens `wa.me/91…?text=…₹10,000 is pending for KI/26-27/…`. The FollowUp is logged and the button switches to "Reminded" (48 h cooldown).
4. Accounts opens the proof side panel. The signed-URL image loads (`naturalWidth > 0`) and the UTR is shown.
5. Accounts bulk-verifies both payments ("2 payments verified.") and the queue empties.
6. On Cash with staff, Accounts marks the ₹4,000 deposited. In the DB: both payments `VERIFIED`, and the deposit account is set.

### `pnpm build`

```
├ ƒ /api/payments/[id]/proof
├ ƒ /api/payments/proof
├ ƒ /collect
├ ƒ /orders/[id]
├ ƒ /payments
├ ƒ /payments/cash
(29 routes, 0 errors)
```

## Screenshots

| Screen | File |
|---|---|
| §11.5 Record payment (Sales, mobile) | `screenshots/record-payment-sheet.png` |
| §11.6 Collect (Sales, mobile) | `screenshots/collect.png` |
| §11.8 Verify queue (Accounts, desktop) | `screenshots/verify-queue.png` |
| §11.8 Cash with staff | `screenshots/cash-with-staff.png` |
| §11.4 Order detail — payments, timeline, collect card | `screenshots/order-detail-payments.png` |

## Spec traceability

| Spec | Implementation |
|---|---|
| §5.2 two numbers (customer balance vs company-confirmed) | Order detail money card: Paid (verified) / Awaiting verification / Balance due |
| §5.2 personal-receiver rule | Amber "With {name}" chip until deposited; `/payments/cash`; `markDeposited` |
| §5.2 overpayment > ₹1 blocked | `recordPayment` (server) + sheet-level inline error |
| §5.2 cheques stay pending | Default `PENDING_VERIFICATION`; sheet footer says "Stays pending until the cheque clears" |
| §5.4 overdue rule, promised dates, Collect lists | `domain/payment/collect.ts`, `repo/collect.ts`, `/collect` |
| §13 reminder rate limit (1 per order per 48 h) | `followUpService.logReminder` (server-enforced) |
| BR-05 receipt numbers | `RCPT/{FY}/{SEQ5}` via `DocumentCounter` in the record/refund tx |
| BR-09 balance + CLOSED/re-open | `domain/payment/balance.ts` + `recomputeAndWriteBalance` |
| §4.2 Record payment / Verify / Refund rows | `payments.record` (Sales own), `payments.verify`, `payments.recordRefund` — matrix-tested in `tests/unit/payment-actions.test.ts` |
| §9 Cash with staff | `repo/payments.listCashWithStaff` (non-rejected, person-received, undeposited) |

## Known carry-forward

- **WhatsApp API send**: reminders use the §13 `wa.me` deep-link fallback and are logged as FollowUps. The API path, templates and auto-reminder job are P6.
- **Dashboard money tiles** (Collected, Awaiting, Cash with staff, Outstanding, aging buckets): the read models exist (`listVerifyQueue`, `listCashWithStaff`, `getCollectView`). The tiles themselves are P5.
- **Delivered date** for the §5.4 grace rule is read from the first `→ DELIVERED` OrderEvent. P4 dispatch writes those events.
- **Native-speaker Tamil review**: carried from P1. The P3 strings were machine-drafted.
- **Testcontainers CI for the integration tier**: carried from P1. CI still skips the DB-backed tests.

## PRs that make up this release

| # | Title |
|---|---|
| [#12](https://github.com/digitalvetri/SalesOS/pull/12) | P3-A: Balance domain + payment service |
| [#13](https://github.com/digitalvetri/SalesOS/pull/13) | P3-B: Record payment sheet (§11.5) + proof upload |
| [#14](https://github.com/digitalvetri/SalesOS/pull/14) | P3-C: Verify queue (§11.8) + cash with staff + refunds |
| [#15](https://github.com/digitalvetri/SalesOS/pull/15) | P3-D: Collect screen (§11.6) + follow-ups + promised dates |
| (gate) | **P3-E: evidence + README fix** |

Tag: `v0.4.0-p3` applied on merge to `main`.
