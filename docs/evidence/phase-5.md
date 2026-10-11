# Phase P5 — Dashboard & Reports · Evidence

Dates: 2026-10-11.
Spec: [`docs/superpowers/specs/2026-10-10-salesos-design.md`](../superpowers/specs/2026-10-10-salesos-design.md) §17-P5 (§9, §11.7, §11.14, §10.6).
Release: `dev` → `main` as `v0.6.0-p5`.

## Status

| Gate requirement (§17-P5) | Status | Where |
|---|---|---|
| Integration test: seeded data → each metric equals a hand-computed value (paste the table) | ✅ 24/24 | `tests/integration/dashboard.test.ts`, table below |
| Open each exported xlsx and paste the header row + first 3 rows | ✅ 7/7 | `scripts/report-samples.ts` (output below) + `tests/integration/reports.test.ts` |
| Screenshot 11.7 (light + dark) | ✅ | `screenshots/dashboard-light.png`, `screenshots/dashboard-dark.png` |
| All §9 metrics with click-through | ✅ | `dashboardService` (one function per metric) + `/dashboard` |
| Leaderboard, charts | ✅ | trend column chart, aging bars (validated chart colour, light + dark) |
| 7 Excel reports | ✅ | `reportService`, `/api/reports/{kind}`, `/reports` |
| §10.6 count-up | ✅ | `CountUp`: 400 ms, skipped under `prefers-reduced-motion` |

## Gate runs

All runs below are against the local Supabase stack (`pnpm sb:start`), with demo data from `pnpm prisma:seed:demo`.

### typecheck / lint / test / build

```
> tsc --noEmit                         (0 errors)
> eslint . && pnpm run lint:fixtures   (0 problems)
 Test Files  29 passed (29)
      Tests  437 passed (437)
All files         |   99.67 |    98.07 |     100 |     100
 domain           |   98.43 |    88.23 |     100 |     100
> next build                           (35 routes, 0 errors: /dashboard, /reports, /payments/collected, /api/reports/[kind] new)
```

### §9 metrics vs hand-computed (`tests/integration/dashboard.test.ts`)

Fixture: 9 orders across KI and KFM, 2 salespeople, verified, pending and refunded payments, 3 cancellations. "Now" is fixed at 20 Oct 2026; period = this month. The fixture is described in the test file's header comment.

| Metric | Expected | Actual |
|---|---|---|
| Booked (Oct 1–20) | 130000 | 130000 |
| Booked (Sep, comparison) | 60000 | 60000 |
| Booked change % | 117 | 117 |
| Booked — KI only | 90000 | 90000 |
| Collected (verified) | 83000 | 83000 |
| Awaiting verification | {"value":"10000","count":1} | {"value":"10000","count":1} |
| Cash with staff | {"value":"10000","people":[["Viji","10000"]]} | {"value":"10000","people":[["Viji","10000"]]} |
| Outstanding | ["115000",5] | ["115000",5] |
| Overdue | ["75000",3] | ["75000",3] |
| Aging 0–15 / 16–30 / 31–60 / 60+ | ["20000","0","40000","15000"] | ["20000","0","40000","15000"] |
| Refunds due | ["3000",1] | ["3000",1] |
| Outstanding — KI only | 60000 | 60000 |
| Stuck orders | [["T/1",15]] | [["T/1",15]] |
| Pending approvals | 1 | 1 |
| Leaderboard [name, booked, target, %, orders, avg, collected] | [["Viji","80000","100000",80,2,"40000","23000"],["Naren","50000","0",null,2,"25000","60000"]] | [["Viji","80000","100000",80,2,"40000","23000"],["Naren","50000","0",null,2,"25000","60000"]] |
| Trend months | ["2025-11","2026-10"] | ["2025-11","2026-10"] |
| Trend non-zero | [["2025-12","15000"],["2026-09","60000"],["2026-10","130000"]] | [["2025-12","15000"],["2026-09","60000"],["2026-10","130000"]] |
| Top products by qty | [["Grinder A",3],["SS table",3],["Peeler",1]] | [["Grinder A",3],["SS table",3],["Peeler",1]] |
| Top products by value | [["Grinder A","90000"],["Peeler","30000"],["SS table","10000"]] | [["Grinder A","90000"],["Peeler","30000"],["SS table","10000"]] |
| Top customers | [["Gokul","80000"],["Rew","40000"],["Mathews","10000"]] | [["Gokul","80000"],["Rew","40000"],["Mathews","10000"]] |
| Repeat customers (≥ 2 orders) | 2 | 2 |
| Cancellations [count, value] | [3,"53000"] | [3,"53000"] |
| Cancellations by reason | [["PRICE",1,"25000"],["DELIVERY_DELAY",1,"20000"],["FINANCIAL_ISSUE",1,"8000"]] | [["PRICE",1,"25000"],["DELIVERY_DELAY",1,"20000"],["FINANCIAL_ISSUE",1,"8000"]] |
| Needs action | {"approvals":1,"toVerify":1,"stuck":1,"cancelRequests":0,"refundsDue":1} | {"approvals":1,"toVerify":1,"stuck":1,"cancelRequests":0,"refundsDue":1} |

### Reports: header row + first 3 rows (`pnpm tsx scripts/report-samples.ts`, demo data, last 180 days)

Every sheet re-opens with a frozen pane at row 1, `[$₹-4009] #,##,##0` on money columns and `DD-MMM-YYYY` on dates. ISO dates and ₹ amounts below are the script's rendering of the cell values.

#### sales-register — sheet "Sales register", 397 rows, frozen ySplit=1

| Order date | Order no. | Entity | Customer | Phone | City | Salesperson | Status | Item | Qty | Unit price | Line total | Order total | Balance due |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-04-17 | KFM/26-27/0051 | KFM | Kovai Restaurant | +919870182137 | Salem | Test User | CLOSED | 15kg Potato Peeler | 12 | ₹24,000 | ₹2,88,000 | ₹2,88,000 | ₹0 |
| 2026-04-17 | KI/26-27/0092 | KI | Selvam Mess | +919870071271 | Madurai | Murugan | DELIVERED | Vegetable Cutting Machine | 1 | ₹29,000 | ₹29,000 | ₹1,14,025 | ₹91,225 |
| 2026-04-17 | KI/26-27/0092 | KI | Selvam Mess | +919870071271 | Madurai | Murugan | DELIVERED | 5kg Turbo Stove | 1 | ₹9,025 | ₹9,025 | ₹1,14,025 | ₹91,225 |

#### collections — sheet "Collections", 217 rows, frozen ySplit=1

| Paid on | Receipt no. | Order no. | Customer | Salesperson | Type | Method | Amount | Status | Received into | Reference | Verified by | Verified on | Reject reason |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2026-04-17 | RCPT/26-27/00116D | KFM/26-27/0051 | Kovai Restaurant | Test User | ADVANCE | UPI | ₹1,44,000 | VERIFIED | KFM Current A/c | UTR739905044 | Accountant | 2026-04-17 |  |
| 2026-04-17 | RCPT/26-27/00140D | KI/26-27/0092 | Selvam Mess | Murugan | ADVANCE | UPI | ₹22,800 | VERIFIED | KI Current A/c | UTR181916853 | Accountant | 2026-04-17 |  |
| 2026-04-18 | RCPT/26-27/00102D | KFM/26-27/0045 | Sri Krishna Snacks | Snegha | ADVANCE | CHEQUE | ₹15,700 | VERIFIED | KFM Current A/c | UTR407245882 | Accountant | 2026-04-18 |  |

#### outstanding — sheet "Outstanding", 55 rows, frozen ySplit=1

| Customer | Phone | City | Open orders | Outstanding | Overdue | 0–15 days | 16–30 days | 31–60 days | 60+ days | Max days overdue |
|---|---|---|---|---|---|---|---|---|---|---|
| Ram Industries | +919870403869 | Tirupur | 2 | ₹3,90,075 | ₹3,90,075 | ₹3,80,400 | ₹0 | ₹0 | ₹9,675 | 67 |
| Aachi Caterers | +919870459302 | Bengaluru | 5 | ₹4,98,025 | ₹3,43,225 | ₹0 | ₹0 | ₹2,72,000 | ₹71,225 | 152 |
| Gokul Restaurant | +919870031676 | Madurai | 4 | ₹4,70,400 | ₹3,40,800 | ₹80,800 | ₹0 | ₹2,60,000 | ₹0 | 47 |

#### salesperson-performance — sheet "Salesperson performance", 8 rows, frozen ySplit=1

| Salesperson | Booked | Target | % of target | Orders | Avg order | Collected (verified) |
|---|---|---|---|---|---|---|
| Vignesh | ₹37,96,000 | ₹55,00,000 | 69 | 22 | ₹1,72,545 | ₹13,82,600 |
| Naren | ₹34,15,850 | ₹59,00,000 | 58 | 25 | ₹1,36,634 | ₹19,67,825 |
| Mallika | ₹29,22,975 | ₹66,00,000 | 44 | 26 | ₹1,12,422 | ₹15,94,625 |

#### cash-with-staff — sheet "Cash with staff", 28 rows, frozen ySplit=1

| Paid on | Receipt no. | Held by | Order no. | Customer | Method | Amount | Status | Deposited to | Deposited on | Days held |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-04-22 | RCPT/26-27/00199D | Murugan | KI/26-27/0119 | Rew Hotels | CASH | ₹7,600 | VERIFIED | KI Current A/c | 2026-04-22 | 0 |
| 2026-05-25 | RCPT/26-27/00148D | Murugan | KI/26-27/0097 | Aachi Caterers | CASH | ₹14,300 | VERIFIED | KI Current A/c | 2026-05-25 | 0 |
| 2026-06-06 | RCPT/26-27/00201D | Vignesh | KI/26-27/0123 | Ram Industries | CASH | ₹1,63,000 | VERIFIED | With staff |  | 127 |

#### cancellations — sheet "Cancellations", 9 rows, frozen ySplit=1

| Cancelled on | Order no. | Order date | Customer | Salesperson | Order total | Reason | Note | Refund still due |
|---|---|---|---|---|---|---|---|---|
| 2026-05-26 | KFM/26-27/0018 | 2026-05-22 | Annapoorna Mess | Naren | ₹14,500 | CUSTOMER_CHANGED_MIND |  | ₹2,900 |
| 2026-07-16 | KI/26-27/0073 | 2026-07-06 | Gokul Restaurant | Snegha | ₹1,20,075 | DELIVERY_DELAY |  | ₹24,000 |
| 2026-08-20 | KI/26-27/0069 | 2026-08-18 | Kovai Bhavan | Test User | ₹37,000 | PRICE |  | ₹18,500 |

#### product-sales — sheet "Product sales", 18 rows, frozen ySplit=1

| Product | Qty | Value |
|---|---|---|
| 50kg Dough Kneader | 58 | ₹39,37,200 |
| 20L Tilting Wet Grinder | 70 | ₹36,03,600 |
| E2E 10L Tilting | 88 | ₹28,08,000 |

### E2E (Pixel 7 + Desktop 1440)

`tests/e2e/dashboard.spec.ts`:
- **Owner:** lands on `/dashboard`; all five money tiles show; exactly **one `[data-gold]`** (the Collected hero).
- **Light and dark screenshots:** dark is enabled from the profile menu and persists across a reload via a cookie.
- **Click-through:** the hero opens `/payments/collected?from=…&to=…`; a trend column opens `/orders?from=…&to=…` (a filtered view).
- **Accounts:** money tiles only; no Sales team or Needs action panels.
- **Reports:** one gold; downloading gives `SalesOS-sales-register-<from>_to_<to>.xlsx`, which opens with the right header and frozen pane.

Full suite: **28+ passed, 0 failed**. Skips are tests limited to the other viewport.

## Screenshots

| Screen | File |
|---|---|
| §11.7 Admin dashboard: light | `screenshots/dashboard-light.png` |
| §11.7 Admin dashboard: dark | `screenshots/dashboard-dark.png` |
| §11.14 Reports | `screenshots/reports.png` |
| Owner / Admin / Accounts landing | `screenshots/shell-{owner,admin,accounts}.png` |

## Spec traceability

| Spec | Implementation |
|---|---|
| §9 every metric, exact definitions | `dashboardService.ts`, one exported function per metric, each tested |
| §9 "no dead-end numbers" | Tiles → orders / collected / verify / cash / collect; Needs action → filtered lists; leaderboard → that salesperson's orders; trend → that month's orders |
| §11.7 period + entity selectors | `this_month` (default, IST), `last_month`, `last_30`, `this_fy`; KI / KFM / both |
| §10.4 gold only on Collected | Asserted in E2E (`[data-gold]` count = 1) |
| §10.6 count-up | `CountUp` (400 ms, reduced-motion aware) |
| §10.1 dark theme opt-in | Profile-menu toggle (Owner/Admin), `salesos.theme` cookie, `data-theme` on `<html>` |
| §11.0 landing pages | Owner/Admin → Dashboard, Accounts → Payments |
| §11.14 formats | `buildSheet()`: one header row, frozen pane, ₹ + date numFmts, autofilter |
| §4.2 Accounts 👁 money tiles; Sales 👤 reports | `level(...) === "readOnly"` hides panels; `salespersonScope` on Sales exports |
| §16 seed data | `prisma/seed-demo.ts`: deterministic 60 customers, 200 orders over 6 months, payments, dispatches, targets |

## Known carry-forward

- **Saved views + Excel export of the orders list** (from P2): the 7 reports cover the export need. Saved views remain P8 polish.
- **Lighthouse performance on the dashboard** (13 parallel queries): fine on the pilot data size; revisit in the P8 performance pass.
- **Native-speaker Tamil review:** carried forward.

## PRs that make up this release

| # | Title |
|---|---|
| [#23](https://github.com/digitalvetri/SalesOS/pull/23) | P5-A: Admin dashboard (§11.7): every §9 metric, click-through, charts, dark theme, demo seed |
| [#24](https://github.com/digitalvetri/SalesOS/pull/24) | P5-B: 7 Excel reports (§11.14) + /reports |
| (gate) | **P5-C: evidence + main → dev sync** |

Tag: `v0.6.0-p5` on merge to `main`.
