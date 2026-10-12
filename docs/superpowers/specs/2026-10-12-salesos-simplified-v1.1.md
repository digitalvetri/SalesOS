# SalesOS v1.1 — Simplified Scope (Change Spec)

> **Purpose:** cut the existing SalesOS build down to a very simple product: **two dashboards (Admin, Employee)**, a **spreadsheet-style order sheet**, **targets with progress charts**, and an **Employees page**. Everything else is removed from the UI.
> This file **overrides** `2026-10-10-salesos-design.md` wherever they disagree. Sections of the old spec not mentioned here still apply (stack, money rules, IST, audit log, security).

| Field | Value |
|---|---|
| Version | 1.1 |
| Date | 12 Oct 2026 |
| Owner | Kishore M S, Founder — DigitalVetri |
| Applies to | The existing SalesOS codebase (Next.js + Prisma + Supabase) |
| Visual style | **Keep the current app look** (navy sidebar, warm paper background, gold accent, current fonts). Do not redesign. |

---

## 0. Rules for the builder

1. This is a **modification** of a working app, not a rebuild. Reuse existing auth, layout shell, components and DB where possible.
2. **Do not delete database tables** in this change. Remove or hide the UI and routes only. Data stays safe.
3. Every phase ends with a **Verification Gate**. Paste raw command output and screenshots into `docs/evidence/v1.1-phase-N.md`. No evidence = not done.
4. No silent failures. Every save shows a success toast or a clear error with a reference id.
5. Money uses `decimal.js` and `Decimal(14,2)`. Dates are IST.

---

## 1. What changes (summary)

### 1.1 Removed from the UI (routes return 404 / redirect to Overview, nav items gone)

| Removed | Notes |
|---|---|
| Payments page + payment **verification** | No verification of any kind. A payment is counted the moment it is entered. |
| Collect page | Merged into Orders: a **"Balance due"** filter on the order sheet does the same job. |
| Dispatch board | Removed. Order status is just **Pending / Completed / Cancelled**. |
| Customers page | Removed as a page. Tapping a customer name anywhere opens the **Customer panel** (§5.4). |
| Price List page | Removed. Product is **typed freely** by the employee. |
| Reports page | Removed. No separate download section. |
| Price approval, cancel-approval flows, "Needs action" box, aging, stuck orders, WhatsApp automation | Removed from v1.1. |

### 1.2 What remains

**Employee (salesperson) app — 2 items in the sidebar / bottom nav:**
1. **Overview**: my target vs achieved (ring chart), my month numbers, my last 6 months.
2. **Orders**: my order sheet (spreadsheet-style), including past months.

**Admin app — 4 items:**
1. **Overview**: orders completed this month, payment received this month, pending orders, and a target-progress chart for every employee.
2. **Orders**: one sheet with every employee's orders, live.
3. **Employees**: list. Tap an employee to see their monthly sales history, target, login details, and actions (reset password, deactivate).
4. **Settings**: company name, billing entities (KI / KFM), default monthly target, admin's own password.

---

## 2. Definitions (binding — every number on screen uses these)

| Term | Definition |
|---|---|
| **Order status** | `PENDING` (default on create), `COMPLETED`, `CANCELLED`. Nothing else. |
| **Completed order** | Status = `COMPLETED`. `completedAt` (date, IST) is set when it is marked completed. |
| **Pending order** | Status = `PENDING`, any date. |
| **Order total** | Amount typed by the employee for the whole order. |
| **Paid** | Sum of all payment entries on the order (advance + later payments). |
| **Balance** | `Total − Paid`. **Always calculated, never typed.** Shown in amber when > 0, green "Paid" when 0. |
| **Payment received (this month)** | Sum of payment entries whose **payment date** is in the current month (IST), all employees, excluding cancelled orders. |
| **Orders completed (this month)** | Count (and ₹ value) of orders with `completedAt` in the current month. |
| **Target** | Monthly ₹ amount per employee, set by Admin on the Employees page. A blank target uses the default from Settings. A default of 0 means "no target set". |
| **Achieved** | Sum of **order totals** of non-cancelled orders with **order date** in that month, for that employee. (Same as how sales were counted in the Excel sheets.) |
| **Achieved %** | `Achieved ÷ Target × 100`, rounded to whole %. Can exceed 100%. If target = 0, show "No target". |
| **S.No** | Auto running number **per employee**, starting at 1, never reused (cancelled rows keep their number). Generated server-side in the create transaction. |

---

## 3. Data changes (Prisma)

Keep existing models. Make these changes in one migration named `v1_1_simplify`.

```prisma
enum OrderStatusV2 { PENDING COMPLETED CANCELLED }

model Order {
  // …existing fields kept…
  serialNo      Int                 // per-salesperson running number (S.No)
  productText   String              // free text typed by employee, e.g. "10L tilting grinder, 6\" IRG"
  simpleStatus  OrderStatusV2       @default(PENDING)
  completedAt   DateTime?           @db.Date
  paidTotal     Decimal             @default(0) @db.Decimal(14, 2) // cached Σ payments
  // balanceDue (existing) = total − paidTotal, recomputed in the same transaction
  @@unique([tenantId, salespersonId, serialNo])
}

model SalesTarget {
  // existing: tenantId, userId, month (first day of month), amount
}

model TenantSettings {
  // add:
  defaultMonthlyTarget Decimal @default(0) @db.Decimal(14, 2)
}

model Payment {
  // keep table. From v1.1:
  //  - status is always written as VERIFIED (verification UI removed)
  //  - method: CASH | UPI | BANK_TRANSFER | CHEQUE
  //  - receivedIntoAccountId / receivedByUserId become OPTIONAL (drop the CHECK constraint)
}

model User {
  // add:
  loginId        String   // the mobile number used to sign in (display only)
  lastLoginAt    DateTime?  // already exists in v1.0; ensure it is written on every login
  passwordSetAt  DateTime?
}
```

**Migration notes**
- Back-fill `serialNo` for existing orders per salesperson, ordered by `orderDate, createdAt`.
- Back-fill `productText` from the existing order lines (`description` joined with ", ").
- Map old statuses: `DELIVERED, CLOSED → COMPLETED`, `CANCELLED → CANCELLED`, everything else `→ PENDING`.
- Back-fill `paidTotal` = Σ non-rejected payments, then recompute `balanceDue`.
- Order lines, dispatch, product and price tables stay in the DB, unused by the v1.1 UI.
- Add a DB counter row per salesperson (`DocumentCounter key = "SNO:<userId>"`) for S.No, locked with `SELECT … FOR UPDATE` inside the create transaction.

---

## 4. Employee app

### 4.1 Navigation
- Desktop/tablet: navy sidebar with **Overview** and **Orders**. The header shows the name and a sign-out button.
- Phone: the same two items as a bottom nav.

### 4.2 Overview (employee) — [GOLD] = "+ New order" button

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Good evening, Selva                                              [ + New order ] ◀GOLD│
├──────────────────────────────┬───────────────────────────────────────────────────────┤
│  OCTOBER TARGET              │  THIS MONTH                                           │
│                              │  ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│        ╭───────╮             │  │ ORDERS     │ │ COMPLETED  │ │ PENDING    │          │
│      ╱    68%   ╲            │  │ 17         │ │ 11         │ │ 6          │          │
│     │  ₹10.2L    │           │  └────────────┘ └────────────┘ └────────────┘          │
│      ╲ of ₹15L  ╱            │  ┌────────────────────────┐ ┌────────────────────────┐ │
│        ╰───────╯             │  │ PAYMENT RECEIVED       │ │ BALANCE TO COLLECT     │ │
│  ₹4.8L more to reach target  │  │ ₹7,40,500              │ │ ₹1,84,300 · 7 orders  ›│ │
│  15 days left                │  └────────────────────────┘ └────────────────────────┘ │
├──────────────────────────────┴───────────────────────────────────────────────────────┤
│  LAST 6 MONTHS — ACHIEVED vs TARGET                                                    │
│  ₹L                                                                                    │
│  20 ┤        ▇                                                                          │
│  15 ┤ ─ ─ ─ ─▇─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  target line                                │
│  10 ┤  ▇     ▇     ▇     ▇            ▇                                                │
│   5 ┤  ▇  ▇  ▇  ▇  ▇  ▇  ▇  ▇    ▇    ▇                                                │
│     └──May───Jun───Jul───Aug───Sep───Oct──                                            │
│     Click a month → opens Orders filtered to that month                                │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  RECENT ORDERS (last 5)                                         See all orders ›       │
│  #42  12 Oct  Sri Pack       10L tilting, 6" IRG   ₹62,500  Bal ₹42,500  [Pending]    │
│  #41  10 Oct  Gokul          15kg potato peeler    ₹24,000  Bal ₹14,000  [Pending]    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Target ring:** a donut chart. Filled arc = achieved %, track = remainder. Above 100% the ring is full and the label shows e.g. "112% 🎯 target crossed" in green text (no emoji in the build; use a check icon).
- **No target set:** the ring is replaced by "No target set for October. Ask your admin." plus the achieved amount.
- **Balance to collect** tile opens Orders with the "Balance due" filter on.
- Phone layout: ring first, then the 5 tiles in a 2-column grid, then the chart, then recent orders.

### 4.3 Orders — the spreadsheet (employee) — [GOLD] = "+ New order"

A modern sheet: sticky header row, zebra-free rows, thin borders, tabular numbers, fast keyboard entry. It looks and behaves like Excel, but it is safer.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ My orders            [ October 2026 ▾ ]  [All | Pending | Completed | Balance due]   🔍 Search       │
│                                                                                 [ + New order ] ◀GOLD│
├─────┬──────────┬──────────────────────────┬──────────────┬──────────────────┬─────────┬─────────┬─────────┬───────────┤
│S.No │ Date     │ Product                  │ Contact      │ Customer name    │ Total   │ Paid    │ Balance │ Status    │
├─────┼──────────┼──────────────────────────┼──────────────┼──────────────────┼─────────┼─────────┼─────────┼───────────┤
│ 43  │ 12-10-26 │ ▌typing…                 │              │                  │         │         │   —     │ Pending   │ ← new row
│ 42  │ 12-10-26 │ 10L tilting, 6" IRG      │ 99439 64442  │ Sri Pack ›       │ 62,500  │ 20,000  │ 42,500  │ Pending ▾ │
│ 41  │ 10-10-26 │ 15kg potato peeler       │ 98xxx xxx12  │ Gokul ›          │ 24,000  │ 10,000  │ 14,000  │ Pending ▾ │
│ 40  │ 08-10-26 │ 3L grinder + spares      │ 94xxx xxx70  │ Akchaya W/G ›    │ 18,250  │ 18,250  │ Paid    │ Completed │
├─────┴──────────┴──────────────────────────┴──────────────┴──────────────────┼─────────┼─────────┼─────────┼───────────┤
│ October total · 17 orders                                                     │10,21,400│ 7,40,500│ 2,80,900│ 11 done   │
└───────────────────────────────────────────────────────────────────────────────┴─────────┴─────────┴─────────┴───────────┘
```

**Columns (in this order):**

| # | Column | Filled by | Rules |
|---|---|---|---|
| 1 | **S.No** | Auto | Per-employee running number. Read-only. |
| 2 | **Date** | Auto (today, IST) | Editable only to an earlier date, max 7 days back. Admin can set any date. |
| 3 | **Product** | Employee types | Free text, required, up to 500 chars. Suggestions come from this employee's recent product texts. |
| 4 | **Contact** | Employee types | Required. 10-digit Indian mobile (or `+` international). If the number is known, **Customer name autofills** and a small "Existing customer · 5 orders · ₹35,000 due" hint appears. |
| 5 | **Customer name** | Employee types / autofill | Required. Tap it in any saved row to open the **Customer panel** (§5.4). |
| 6 | **Total** | Employee types | Required, > 0. Accepts "62500", "62,500", "62.5k". |
| 7 | **Paid** | Employee types (advance) | Optional, default 0, cannot exceed Total. On a saved row, clicking Paid opens **Add payment** (§4.5) instead of editing the number. |
| 8 | **Balance** | Auto | Total − Paid. Read-only. Amber if > 0, green "Paid" if 0. |
| 9 | **Status** | Dropdown | Pending (default) / Completed / Cancelled. Cancelled needs a one-line reason. |
| 10 | *(hidden by default, toggle "More columns")* | Optional | Payment mode of the advance (Cash / UPI / Bank / Cheque), Bill from (KI / KFM), Delivery date, Notes. |

**New order flow (desktop/tablet):**
1. Click **+ New order** (or press `N`). A new row appears at the **top** with S.No and Date already filled. The cursor goes to **Product**.
2. Type Product → `Tab` → Contact → `Tab` → Customer name (often autofilled) → `Tab` → Total → `Tab` → Paid → `Enter` saves.
3. While saving, the row shows a spinner. On success it shows a green flash and the toast "Order #43 saved". On error the row stays editable, the bad cell is outlined red, and the message appears under it.
4. `Esc` cancels an unsaved row (with confirm if anything was typed).

**New order flow (phone):** "+ New order" opens a **full-screen form** with the same fields in the same order: S.No/Date shown at the top (read-only), big inputs, numeric keypad for contact and amounts, live Balance at the bottom, and one **Save order** button ([GOLD]). After saving, it returns to the sheet with the new row on top.

**Editing:** an employee can edit their own row's Product, Contact, Customer name and Total while the order is `PENDING`. Completed orders are read-only for employees (admin can edit). Every edit is audit-logged.

**Past months:** the month picker lists every month that has orders. "All time" is also available. Filters: All / Pending / Completed / Balance due. Search covers product, customer and contact.

**Row footer:** month totals for Total, Paid and Balance, plus a count of completed orders.

**Phone sheet view:** a horizontal-scroll table with **S.No + Customer name sticky** on the left. Tapping a row opens the order detail sheet with all fields plus "Add payment" and "Mark completed".

### 4.4 Validation messages (exact copy, also in Tamil file)
| Case | Message |
|---|---|
| Missing product | "Type what the customer ordered." |
| Bad phone | "Enter a 10-digit mobile number." |
| Missing name | "Enter the customer's name." |
| Total ≤ 0 | "Total must be more than ₹0." |
| Paid > Total | "Paid can't be more than the total (₹62,500)." |
| Network fail | "Couldn't save — check your internet and press Enter again. Your typing is kept." |

### 4.5 Add payment (small popover / bottom sheet)
Fields: **Amount** (default = current balance), **Date** (today), **Mode** (Cash / UPI / Bank / Cheque), **Note** (optional). Save adds a payment entry and Paid/Balance update instantly.
- **No verification step.** The payment counts immediately in "Payment received".
- The payment history is listed under the order (date · amount · mode · entered by). An employee can delete their **own** payment within 24 hours (typo protection). After that only the admin can.

---

## 5. Admin app

### 5.1 Navigation
Sidebar: **Overview · Orders · Employees · Settings**. Nothing else.

### 5.2 Overview (admin) — [GOLD] = "Payment received" figure tile

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ Overview                                          [ October 2026 ▾ ]   [ KI + KFM ▾ ]            │
├────────────────────────────────┬────────────────────────────────┬────────────────────────────────┤
│ ORDERS COMPLETED               │ PAYMENT RECEIVED  ◀ GOLD       │ PENDING ORDERS                 │
│ 64                             │ ₹78,42,800                     │ 38                             │
│ ₹84,10,300 value               │ 212 payments this month        │ ₹21,60,000 still to collect    │
├────────────────────────────────┴────────────────────────────────┴────────────────────────────────┤
│ TARGET PROGRESS — OCTOBER                                                                         │
│                                                                                                   │
│  Naren       ██████████████████████████████░░░░░░░░░░░░░   70%   ₹14.0L / ₹20.0L                 │
│  Mallika     ████████████████████████████████████░░░░░░░   86%   ₹21.5L / ₹25.0L                 │
│  Viji        ██████████████████████████████████████████▶  122%   ₹18.2L / ₹15.0L                 │
│  Vignesh     ██████████████████████████████████████████▶  140%   ₹42.1L / ₹30.0L                 │
│  Dhanushya   ██████████████████████████████████████████▶  149%   ₹14.9L / ₹10.0L                 │
│  Snegha      ███████████████████████████████████████░░░░   92%   ₹9.2L  / ₹10.0L                 │
│  Selva       ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    0%   ₹0     / ₹8.0L                  │
│  (sorted by % — click a name → Employees › that person)                                            │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ LATEST ORDERS (live)                                                         See all orders ›    │
│ 12 Oct 18:42   Viji    Sri Pack    10L tilting, 6" IRG   ₹62,500   Bal ₹42,500   Pending          │
│ 12 Oct 17:10   Naren   Ruban       10kg oil dryer        ₹19,500   Paid          Completed        │
│ 12 Oct 16:05   Selva   Gokul       15kg potato peeler    ₹24,000   Bal ₹14,000   Pending          │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Three tiles only:** Orders completed (count + value), **Payment received** ([GOLD]), Pending orders (count + their total balance). Each tile is clickable and opens Orders with the matching filter.
- **Target progress:** one horizontal bar per active employee: bar = achieved %, a marker at 100%, value labels. Colours: below 50% = muted ink, 50–99% = navy, ≥ 100% = green. Text always shows the % (never colour alone). Sorted by % descending.
- An employee with no target shows "No target · ₹X booked".
- **Latest orders (live):** last 8 orders across everyone. New orders appear **within 5 seconds** without refresh (§6).
- **Removed from the current screen:** "Booked" tile, "Booked · last 12 months" chart, "Needs action", "Awaiting verification", "Cash with staff", "Outstanding" tiles, "Completed orders — monthly history" table (moved into Employees detail), Sales team table (replaced by the target bars).

### 5.3 Orders (admin)
The same spreadsheet component as §4.3, with:
- An extra **Employee** column after S.No (shows who created it) and a filter "Employee: All ▾".
- S.No is shown as `NR-42` (employee initials + their S.No) so numbers never clash across employees.
- Admin can edit any field of any order, change status, add or delete payments, and create an order on behalf of an employee.
- Live: rows added by employees appear at the top with a 3-second highlight.
- **"Download Excel"** button: exports exactly the current filtered view (one button, no reports section).

### 5.4 Customer panel (shared by employee and admin)
Opens as a right-side drawer (desktop) or a full-screen sheet (phone) when a customer name is tapped.

```
┌──────────────────────────────────────────┐
│ Sri Pack                             ✕   │
│ 99439 64442      [Call] [WhatsApp]       │
│──────────────────────────────────────────│
│ Orders 13 · Bought ₹5,81,500             │
│ Paid ₹5,46,500 · Balance ₹35,000         │
│──────────────────────────────────────────│
│ #42 12 Oct  10L tilting, 6" IRG          │
│      ₹62,500 · Bal ₹42,500 · Pending     │
│ #39 09 Oct  10kg halwa machine           │
│      ₹72,000 · Bal ₹35,000 · Completed   │
│ …                                        │
│ [ + New order for Sri Pack ]   ◀ GOLD    │
└──────────────────────────────────────────┘
```
- An employee sees only **their own** orders for that customer. The admin sees all, with the employee name per row.
- Edit name / contact (the change applies to all that customer's orders, audit-logged).
- Call opens `tel:`. WhatsApp opens `https://wa.me/91XXXXXXXXXX` (deep link only, no API).

### 5.5 Employees (admin)

**List view:**
```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ Employees                                                              [ + Add employee ] ◀G │
├──────────────┬──────────────┬───────────────┬──────────────┬─────────────┬───────────────────┤
│ Name         │ Login mobile │ Oct target    │ Oct achieved │ %           │ Status            │
├──────────────┼──────────────┼───────────────┼──────────────┼─────────────┼───────────────────┤
│ Naren        │ 98437 22055  │ ₹20,00,000    │ ₹14,00,000   │ 70%         │ Active            │
│ Selva Dharsh.│ 90031 xxxxx  │ ₹8,00,000     │ ₹0           │ 0%          │ Active            │
└──────────────┴──────────────┴───────────────┴──────────────┴─────────────┴───────────────────┘
```

**Detail view (tap a row):**
```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Employees     Naren                                            [Active ●]                  │
├───────────────────────────────────────┬──────────────────────────────────────────────────────┤
│ LOGIN DETAILS                         │ TARGET                                               │
│ Login mobile   98437 22055            │ October 2026   [ ₹20,00,000 ] [Save]                 │
│ Password       •••••••• set 2 Oct     │ Next month     [ ₹20,00,000 ]                        │
│ [Reset password]                      │                                                      │
│ Last login     12 Oct, 18:40          │                                                      │
│ Role           Employee               │                                                      │
│ [Deactivate]                          │                                                      │
├───────────────────────────────────────┴──────────────────────────────────────────────────────┤
│ SALES BY MONTH                                                                               │
│ Month     Orders  Booked       Target      %      Completed  Payment received  Balance       │
│ Oct 26    6       ₹14,00,000   ₹20,00,000  70%    4          ₹9,10,000         ₹3,20,000     │
│ Sep 26    4       ₹8,97,100    ₹20,00,000  45%    3          ₹5,62,100         ₹3,35,000     │
│ Aug 26    7       ₹14,60,740   ₹15,00,000  97%    7          ₹14,60,740        ₹0            │
│ … (click a month → Orders filtered to Naren + that month)                                    │
│ [ bar chart of the same months: booked vs target line ]                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Passwords — security rule (important):**
- Passwords are stored **hashed** by Supabase Auth. **Nobody, including the admin, can view an existing password.** This protects the business if the admin's laptop or session is ever exposed.
- What the admin gets instead: **Reset password** → the system generates a new 8-character password (or the admin types one) and shows it **once** with [Copy] and [Send on WhatsApp] (wa.me deep link). It also shows "Password set on <date>". The employee's other sessions are signed out.
- **Add employee:** name, login mobile, role (Employee / Admin), monthly target, starting password (shown once).
- **Deactivate:** the employee can no longer sign in. Their orders stay and remain visible to the admin.

### 5.6 Settings (admin)
- Company display name and logo.
- Billing entities (KI, KFM): name, GSTIN (optional), shown as "Bill from" choices.
- Default monthly target for new employees.
- Language default (English / Tamil).
- Change my password.

---

## 6. Live updates
- Admin **Overview → Latest orders**, the admin **Orders** sheet, and Overview tiles update **without refresh** when any employee creates or edits an order or adds a payment.
- Implementation: Supabase Realtime subscription on `Order` and `Payment` inserts/updates for the tenant (server-validated channel). Fall back to polling every 30 s if the realtime connection drops. Show a small "Live" dot in the header, grey when disconnected.
- Employee screens refresh their own data after every save (no realtime needed).

---

## 7. Permissions (v1.1)

| Action | Employee | Admin |
|---|---|---|
| See Overview (own) | ✅ | — |
| See Admin Overview | ❌ | ✅ |
| Create order | ✅ (self) | ✅ (any employee) |
| See orders | Own only (all months) | All |
| Edit order while Pending | Own | Any |
| Edit Completed order | ❌ | ✅ |
| Change status | Own orders | Any |
| Add payment | Own orders | Any |
| Delete payment | Own, within 24 h | Any |
| Customer panel | Own orders for that customer | All |
| Employees page | ❌ | ✅ |
| Set targets | ❌ | ✅ |
| Reset passwords / add / deactivate users | ❌ | ✅ |
| Settings | ❌ | ✅ |
| Download Excel (orders view) | ❌ | ✅ |

Enforced on the **server** in every Server Action (`assertCan`), not just by hiding buttons. A test proves an employee calling an admin action gets 403.

---

## 8. Build phases & verification gates

| Phase | Scope | Gate — paste raw evidence into `docs/evidence/v1.1-phase-N.md` |
|---|---|---|
| **S1 Trim** | Remove Payments, Collect, Dispatch, Customers, Price List, Reports and verification from nav + routes (redirect to Overview). Rename employee "Home" → "Overview". Admin nav = Overview · Orders · Employees · Settings. | `pnpm typecheck && pnpm lint && pnpm build` output. `curl -I` on each removed route showing 307/404. Screenshots of both sidebars. |
| **S2 Data** | Migration `v1_1_simplify` (§3) with back-fills; S.No counter; balance recompute | `prisma migrate status`. A SQL query output proving: every order has `serialNo`, no duplicates per employee, `balanceDue = total − paidTotal` for 100% of rows. |
| **S3 Order sheet** | §4.3–4.5 spreadsheet component (desktop + phone form), autofill by contact, validation copy, add payment, month picker + filters, totals footer, Customer panel §5.4 | Unit tests: S.No generation (50 parallel creates → 50 unique sequential numbers), balance math, amount parser. Playwright: create order via keyboard only in < 30 s (paste trace duration); phone-form flow at 390×844. Screenshots. |
| **S4 Employee Overview** | §4.2 ring, tiles, 6-month chart, recent orders | Integration test: seeded orders → achieved %, completed, pending, payment received match hand-computed values (paste table). Screenshots desktop + phone. |
| **S5 Admin Overview + live** | §5.2 three tiles, target bars, latest orders, realtime §6 | Integration test for every tile (paste expected vs actual). Playwright with two browser contexts: employee creates an order → admin sees it in ≤ 5 s (paste timing). Screenshot. |
| **S6 Admin Orders + Employees + Settings** | §5.3, §5.5, §5.6, Excel download of current view | Test: reset password → old password fails, new works, other sessions revoked. Test: employee calling admin actions → 403 (paste output). Open the exported .xlsx and paste the header row + first 3 rows. Screenshots. |

---

## 9. Acceptance checklist (with the client)

- [ ] An employee signs in and sees only **Overview** and **Orders**.
- [ ] On Overview they see their October target ring with the correct % and amount.
- [ ] They add an order using the keyboard only. S.No and date are pre-filled, and the balance calculates itself.
- [ ] Typing a known contact fills the customer name and shows their pending balance.
- [ ] Tapping a customer name shows that customer's orders and balance.
- [ ] They can open September and see last month's orders with totals.
- [ ] Within 5 seconds the admin sees the new order on Overview and Orders without refreshing.
- [ ] Admin Overview shows orders completed, payment received and pending orders for this month, plus a target bar for every employee (e.g. Naren 70%).
- [ ] Admin opens Employees → Naren and sees month-by-month sales, sets November's target, and resets his password (shown once, copyable).
- [ ] No Payments, Collect, Dispatch, Customers, Price List or Reports pages exist anywhere.

---

## 10. Open questions (defaults apply if unanswered)

| # | Question | Default |
|---|---|---|
| Q1 | Does "achieved" count **booked** orders or only **completed** ones? | Booked (order date in month, not cancelled), the same way the Excel sheets counted sales |
| Q2 | Who marks an order Completed: employee, admin, or both? | Both |
| Q3 | Should employees see other employees' figures (leaderboard)? | No |
| Q4 | Keep "Bill from KI / KFM" per order? | Yes, as a hidden optional column defaulting to the employee's entity |
| Q5 | Import the old Excel order book into the new sheet? | Yes, later, as a one-time admin import (old spec §15 parser, mapped to the simplified fields) |

---

## 11. Paste-ready prompts for Claude Code

### S1 — Trim the app
```
Read docs/superpowers/specs/2026-10-12-salesos-simplified-v1.1.md fully. It overrides the v1.0 spec where they differ.
Do phase S1 only (§1, §5.1, §4.1, §8-S1).
- Remove from navigation and routes: Payments (incl. verification), Collect, Dispatch, Customers, Price List, Reports. Removed routes must redirect to the role's Overview. Do NOT drop any database tables.
- Employee nav: Overview, Orders. Admin nav: Overview, Orders, Employees, Settings. Keep the current visual style exactly.
- Delete now-unused UI components only if nothing imports them; list what you deleted.
Show me the list of files you will change before editing. Then complete the S1 gate and write docs/evidence/v1.1-phase-1.md with raw command output and screenshots.
```

### S2 — Data migration
```
Read the v1.1 spec. S1 is done.
Do phase S2 (§2 definitions, §3 data changes and migration notes).
- Create migration v1_1_simplify with all back-fills (serialNo per salesperson, productText, status mapping, paidTotal, balanceDue).
- S.No generation: DocumentCounter "SNO:<userId>" locked with SELECT … FOR UPDATE inside the order-create transaction.
- Payments: always status VERIFIED; drop the receivedInto CHECK constraint; method enum CASH|UPI|BANK_TRANSFER|CHEQUE.
Write pure functions for balance and achieved% in src/server/domain with 100% unit coverage.
Complete the S2 gate (paste prisma migrate status and the SQL integrity query outputs) in docs/evidence/v1.1-phase-2.md.
```

### S3 — The order sheet
```
Read the v1.1 spec. S1–S2 are done.
Build phase S3: the spreadsheet order sheet exactly as §4.3 (columns, order, keyboard flow, validation copy §4.4), the phone full-screen form, Add payment §4.5, month picker + filters + search + totals footer, and the Customer panel §5.4. Build it as ONE reusable component <OrderSheet mode="employee"|"admin"> so S6 can reuse it.
- Contact autofill: on a valid 10-digit number, look up the customer and fill the name; show "Existing customer · N orders · ₹X due".
- Amount parser accepts "62500", "62,500", "62.5k".
- Optimistic UI is allowed only with rollback and a visible error on failure; never lose typed data.
Show me an ASCII sketch of the component tree and the files first. Then build, test, and complete the S3 gate in docs/evidence/v1.1-phase-3.md.
```

### S4 — Employee Overview
```
Read the v1.1 spec. S1–S3 are done.
Build phase S4: the employee Overview exactly as §4.2 — target donut ring (achieved % per §2, >100% handling, "no target" state), the 5 tiles, the 6-month achieved-vs-target chart with click-through to Orders, and recent orders. Keep the current visual style; the only gold element is "+ New order".
Write integration tests against seeded data comparing every number to hand-computed expected values. Complete the S4 gate in docs/evidence/v1.1-phase-4.md (desktop + 390×844 screenshots).
```

### S5 — Admin Overview + live updates
```
Read the v1.1 spec. S1–S4 are done.
Build phase S5: the admin Overview exactly as §5.2 — 3 tiles (gold = Payment received), target progress bars for every active employee (sorted by %, labels always show %), latest orders (live). Remove the old tiles/tables listed in §5.2.
Implement live updates per §6 (Supabase Realtime on Order + Payment, 30 s polling fallback, Live dot).
Gate: Playwright test with two browser contexts — employee creates an order, admin sees it in ≤ 5 s; paste the timing. Paste expected-vs-actual for every tile. Write docs/evidence/v1.1-phase-5.md.
```

### S6 — Admin Orders, Employees, Settings
```
Read the v1.1 spec. S1–S5 are done.
Build phase S6: admin Orders (§5.3, reuse <OrderSheet mode="admin">, Employee column + filter, NR-42 style numbers, Download Excel of the current view), Employees list + detail (§5.5: monthly sales table + chart, target editing for current and next month, Add employee, Reset password shown once with Copy and WhatsApp deep link, Deactivate), and Settings (§5.6).
Passwords must never be readable — only reset (§5.5 security rule). Enforce §7 permissions server-side.
Gate: reset-password test (old fails, new works, other sessions revoked), employee-calls-admin-action → 403 test, exported xlsx header + 3 rows, screenshots. Write docs/evidence/v1.1-phase-6.md, then run the §9 acceptance checklist and report each item as pass/fail with evidence.
```
