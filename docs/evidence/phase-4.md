# Phase P4 — Dispatch · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P4 (§5.3, §5.5, §7 Dispatch/DispatchLine, §11.10, §4.2 Dispatch-role restrictions).
Release: `dev` → `main` as `v0.5.0-p4`.

## Status

| Gate requirement (§17-P4) | Status | Where |
|---|---|---|
| E2E partial dispatch → delivered → closed (paste output) | ✅ 12.3 s | `tests/e2e/dispatch.spec.ts` + integration sequence below |
| Dispatch role's responses contain no price fields (paste JSON snapshot) | ✅ | `tests/integration/dispatch.test.ts`: key snapshot + money-regex check on order DTO and board |
| Screenshot 11.10 | ✅ | `screenshots/dispatch-board.png`, `screenshots/dispatch-board-mobile.png` |
| Board, start / ready / dispatch (partial) / delivered | ✅ | `/dispatch`, `dispatchService` |
| Photos (max 4 per dispatch, delivery proof) | ✅ | private `dispatch-photos` bucket, `/api/dispatch/photo`, signed-URL view |
| Stuck-order rule as a pure function, used by the board badge | ✅ | `domain/dispatch/dispatch.ts` `stuckInfo` (also ready for the P5 dashboard) |
| Dispatch-role price hiding | ✅ | explicit select shapes in `repo/dispatchBoard.ts`; order detail hides money (`orders.viewPrices` denied) |

## Gate runs

All runs below are against the local Supabase stack (`pnpm sb:start`).

### `pnpm typecheck` / `pnpm lint`

```
> tsc --noEmit
(no output — 0 errors)
> eslint . && pnpm run lint:fixtures
(no problems)
OK: forbidden-prisma-import correctly rejected (1 violation).
```

### `pnpm test` (with coverage)

```
 Test Files  25 passed (25)
      Tests  410 passed (410)

File              | % Stmts | % Branch | % Funcs | % Lines
All files         |   99.63 |    97.88 |     100 |     100
 domain           |   98.43 |    88.23 |     100 |     100
```

### Partial dispatch → delivered → closed (`tests/integration/dispatch.test.ts`)

Order: 17 wet grinders + 2 vada machines, fully paid (verified).

```
[P4-gate] start → IN_PRODUCTION
[P4-gate] ready → READY
[P4-gate] dispatch 5/17 grinders → PARTIALLY_DISPATCHED
[P4-gate] dispatch remaining 12 + 2 → DISPATCHED
[P4-gate] first lot delivered → DISPATCHED
[P4-gate] second lot delivered → CLOSED
```

Same file also covers:
- **Guards:** dispatching before ready, over-dispatch ("Only 2 left"), future dates, foreign photo paths, double delivery, Sales refused.
- **Race:** 3 parallel "dispatch everything" calls → exactly 1 succeeds, and quantities stay at 17/2. The order row is locked during each dispatch.
- **Hand-over now:** a stock order goes CONFIRMED → DELIVERED in one tap.
- **Delivered with a balance due** stays DELIVERED (doesn't close).

### Dispatch-role JSON snapshot (no money fields)

The keys of `getDispatchOrder()` are asserted by an inline snapshot. A regex `/price|total|balance|amount|discount|charge|gst|payment|paid|refund/i` over every key, in both the order DTO and the full board, must match nothing. Actual payload:

```json
{
  "id": "cmv3oz53o00327d1329bum1ib",
  "number": "D/26-27/0007",
  "status": "PARTIALLY_DISPATCHED",
  "orderDate": "2026-09-29",
  "promisedDeliveryDate": "2026-10-09",
  "notes": null,
  "customer": {
    "name": "Swaada Foods",
    "phoneE164": "+919999995100",
    "city": "Salem"
  },
  "salespersonName": "Sales",
  "lines": [
    {
      "id": "cmv3oz53o00337d13unsvaqzm",
      "description": "10L Tilting Wet Grinder",
      "qty": 17,
      "dispatchedQty": 5
    },
    {
      "id": "cmv3oz53o00347d13gwm3sgq4",
      "description": "Vada machine",
      "qty": 2,
      "dispatchedQty": 0
    }
  ],
  "dispatches": [
    {
      "id": "cmv3oz54500367d13cp09rqmo",
      "dispatchedOn": "2026-10-11",
      "transporter": "ABT",
      "lrNumber": "1",
      "vehicleNo": null,
      "note": null,
      "photoCount": 0,
      "deliveredOn": null,
      "lines": [
        {
          "orderLineId": "cmv3oz53o00337d13unsvaqzm",
          "qty": 5
        }
      ]
    }
  ]
}
```

### E2E: `pnpm test:e2e` (Pixel 7 + Desktop 1440)

```
  ✓ [desktop] dispatch.spec.ts › workshop moves a stuck order to CLOSED (12.3s)
  ✓ [desktop] payments.spec.ts › sales records with proof, accounts verifies, cash deposited (14.2s)
  ✓ [mobile]  new-order.spec.ts › Viji picks an existing customer, adds a machine, confirms (4.2s)
  … login, settings, catalogue, customers, order-approval, shells (dispatch shell now asserts the Queue)
  11 skipped   # tests limited to the other viewport
  27 passed (1.5m)
```

What `dispatch.spec.ts` checks, on an order that's 12 days old, past its promised delivery date and fully paid:
1. The board shows it in red as "due … (late)", with the gold on its **Start** button. The visible board contains no ₹.
2. Start → Mark ready → Dispatch **1 of 3 machines** with a photo upload, ABT Parcel, LR 88213.
3. The toast's **Send WhatsApp update** opens `wa.me/91…`, and the text includes "dispatched via ABT Parcel, LR 88213: 10L Tilting Wet Grinder ×1".
4. The card shows "2 left to ship". The rest is then dispatched and both lots marked delivered.
5. The card leaves the board, and the DB shows `CLOSED` with dispatched quantities [1, 2].
6. The order detail lists 2 dispatches with a photo link. The mobile board renders segmented tabs.

### `pnpm build`

```
├ ƒ /api/dispatch/[id]/photo
├ ƒ /api/dispatch/photo
├ ƒ /dispatch
(32 routes, 0 errors)
```

## Screenshots

| Screen | File |
|---|---|
| §11.10 Dispatch board (desktop) | `screenshots/dispatch-board.png` |
| §11.10 Dispatch board (mobile, segmented) | `screenshots/dispatch-board-mobile.png` |
| Dispatch role home (Queue) | `screenshots/shell-dispatch.png` |
| Order detail: dispatch history | `screenshots/order-detail-dispatches.png` |

## Spec traceability

| Spec | Implementation |
|---|---|
| §5.1 transitions, stock hand-over | `dispatchService` uses `canTransition`; `handOverNow` (CONFIRMED → DELIVERED) |
| §5.1 CLOSED automation on delivery | `markDelivered` → `recomputeAndWriteBalance` (P3) |
| §5.3 per line + qty, partial delivery | `applyDispatch`, `DispatchLine`, per-lot `deliveredOn`, `isFullyDelivered` |
| §5.3 transport, LR, vehicle, photos ≤ 4, note | `createDispatch` + dispatch sheet |
| §5.3 WhatsApp update on dispatch | toast action → `dispatchUpdateText` + `wa.me` (API send is P6) |
| §5.5 stuck rule | `stuckInfo` (pure, 100 % covered); red age badge + "N orders are stuck" |
| §4.2 Dispatch sees no prices | `DISPATCH_ORDER_SELECT` / `toDispatchDto`; snapshot test |
| §11.10 gold = oldest overdue card's action | `pickGoldCard` |

## Known carry-forward

- **Dashboard "Stuck orders" tile:** `stuckInfo` and `getDispatchBoard().stuckCount` are ready. The tile itself is P5.
- **Production-delay notification** (an alert when an order becomes stuck): needs a scheduled job, planned with P6's reminder job.
- **WhatsApp API send:** P6. Dispatch updates use the `wa.me` fallback.
- **Native-speaker Tamil review:** carried forward.

## PRs that make up this release

| # | Title |
|---|---|
| [#19](https://github.com/digitalvetri/SalesOS/pull/19) | P4-A: Dispatch domain + service (partial dispatch, delivery, stuck rule, money-free DTOs) |
| [#20](https://github.com/digitalvetri/SalesOS/pull/20) | P4-B: Dispatch board (§11.10), dispatch sheet + photos, delivery, Dispatch queue |
| (gate) | **P4-C: evidence** |

Tag: `v0.5.0-p4` on merge to `main`.
