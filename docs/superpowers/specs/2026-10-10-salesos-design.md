# SalesOS — Master Build Spec

> **Order, payment & dispatch CRM for commercial-kitchen and food-processing machinery sellers.**
> Pilot customer: KI (Kumaar Industries) + KFM, Coimbatore. Built multi-company-ready from day one.

| Field | Value |
|---|---|
| Spec version | 1.0 |
| Date | 10 Oct 2026 |
| Owner | Kishore M S, Founder — DigitalVetri |
| Status | Draft for review |
| Audience | Developers and Claude Code (this file is the single source of truth) |
| Product name | **SalesOS** — the sales operating system: orders, payments, dispatch and follow-up automation. The name is set once in `src/config/brand.ts`. |

---

## 0. How to use this document

1. Read §1–§4 to understand **why** and **who**.
2. §5–§9 define **what** (workflows, rules, data). These are binding. If code disagrees with this file, the code is wrong.
3. §10–§12 define **how it looks**. Every screen has an ASCII wireframe. Build the UI to match the wireframes before you polish anything.
4. §17 is the build order. Each phase ends with a **Verification Gate**. A phase is not done until the gate's evidence is pasted into `docs/evidence/phase-N.md`.
5. §19 contains **paste-ready prompts** for Claude Code, one per phase.

**Rules for any builder (human or AI):**
- No silent failures. Every error is shown to the user in plain language and logged with context.
- No placeholder data in production code paths. No "TODO" left in merged code.
- Do not invent fields, roles or statuses that are not in this file. If something is missing, stop and add it to §21 (Open Questions).
- Money is never a JavaScript `number`. Use `decimal.js` in code and `Decimal(14,2)` in the database.

---

## 1. Context — why this exists

We analysed the pilot client's real 2026 order book (`ORDER_DETAILS.xlsx`, 9 sheets). Here is what we found:

| Finding | Evidence from the file | What the CRM must do |
|---|---|---|
| 7 salespeople keep 7 differently-formatted sheets | Columns differ per sheet. Mallika's sheet has no payment column until June | One order form, one schema |
| ~₹7.05 Cr booked across ~1,255 orders (Jan–10 Oct 2026) | Median order ₹28.5k. 13 orders ≥ ₹5L make up ~20% of value | Handle both ₹500 spares and ₹27L multi-machine projects |
| Dates are corrupted | dd/mm swapped to mm/dd on 3 sheets. Typos like "31.06.2026" and "01.09.28" | System-generated dates. No free-text dates |
| Customers duplicated and unnamed | ~340 orders have no real name, ~240 have no phone. Phone numbers sit in the name column | Phone-first customer lookup with deduplication |
| Multi-line orders | One order spans 3–10 rows, with the amount only on the last row | One order holds many line items |
| Balances not maintained | "NILL", formulas, delivered orders still showing balances. ~₹60L "pending" on paper | Balance is **always computed** from payments, never typed |
| Money lands in personal UPI | Only ~40% of value with a recorded route went to KFM/KI company accounts | Every payment records where it landed. Admin verifies each one |
| Hand totals wrong | Viji's July total written as ₹1,46,378. Actual is ₹14,64,378 | Totals are computed only |
| Double entry | Same order on two staff sheets. A separate TURBO ORDER sheet re-lists orders | One order belongs to one salesperson. Product views are filters, not copies |
| Cancellations mostly "delay in delivery" | 16 cancellations, mostly turbo stoves in March | Mandatory cancellation reason. Production-delay alerts |
| Price list has 3 tiers | Dealer price without motor / dealer price / customer price | Price list is built in. Below-floor prices need approval |

**Two billing entities exist within one business:** KI and KFM. Payments go to "KFM CA" (current account), "KI CA", cash, or individuals (Kumaresh, Naren, Avinash, Pradap, Kalai, etc.).

---

## 2. Goals, non-goals, success metrics

### 2.1 Goals
1. **Order entry in ≤ 60 seconds on a phone** for a repeat customer with one machine.
2. **Every rupee traceable**: who received it, into which account, verified by whom.
3. **Owner sees the business live** on one dashboard: booked, collected, outstanding, stuck orders, and each salesperson's performance.
4. **Zero training needed** for salespeople: big buttons, Tamil/English toggle, three-step order flow.
5. **Import the existing Excel order book** so history and outstanding balances carry over on day one.

### 2.2 Non-goals (v1)
- Voice input (explicitly excluded).
- Full accounting, GST return filing, or Tally replacement. We export to Excel/CSV for the accountant.
- Inventory / raw-material / BOM management.
- Customer-facing portal or app.
- Lead management from IndiaMART/JustDial (Phase 2 backlog, §20).
- Native mobile apps. We ship a **PWA** (installable on Android home screen).

### 2.3 Success metrics (measured 60 days after go-live)
| Metric | Target |
|---|---|
| Orders entered in the system vs. paper/WhatsApp | ≥ 95% |
| Median time to create an order (from analytics event) | ≤ 60 s |
| Payments verified by admin within 48 h | ≥ 90% |
| Orders with a real customer name + valid phone | 100% (enforced) |
| Outstanding amount known to the rupee | Yes, from dashboard, no spreadsheet |

---

## 3. Key decisions (locked)

| # | Decision | Why |
|---|---|---|
| D1 | **Single-tenant pilot, multi-tenant schema.** Every business table has `tenantId`. Pilot runs as tenant #1. | Lets DigitalVetri resell to other machinery sellers without a rewrite |
| D2 | **Stack:** Next.js (App Router, latest stable) + TypeScript strict + Prisma + Supabase (Postgres, Auth, Storage) + Tailwind CSS + shadcn/ui (restyled) | DigitalVetri's standard stack |
| D3 | **Server-only data access.** All reads and writes go through Server Actions / Route Handlers using Prisma and a tenant-scoped repository layer. Browser never talks to the database directly. RLS is enabled as defence-in-depth. | One place to enforce roles and tenancy |
| D4 | **Login = mobile number + password**, accounts created by Admin (no self sign-up, no OTP cost). | Simplest for field staff. Admin controls access |
| D5 | **Balances are derived**, never stored as editable fields. A cached `balanceDue` column is recomputed in the same transaction as any payment or order change. | Fixes the #1 problem in the Excel file |
| D6 | **Mobile-first for Sales & Dispatch, desktop-first for Admin & Accounts.** Same app, responsive shells. | Matches how each role works |
| D7 | **Bilingual UI: English + Tamil**, switchable per user, via `next-intl`. Data (product names, notes) stays as typed. | Field staff comfort |
| D8 | **WhatsApp via Meta Cloud API** with a `wa.me` deep-link fallback when the API is not configured. | Works on day one, upgrades cleanly |
| D9 | **Indian conventions:** INR with `decimal.js`, IST (`Asia/Kolkata`) everywhere, Indian number grouping (₹1,23,456), financial year April–March, GSTIN optional on customers | Market fit |
| D10 | **Nothing is hard-deleted.** Orders get cancelled, payments get rejected or reversed, users get deactivated. Full audit log. | Trust and traceability |

---

## 4. Users, roles & permissions

### 4.1 Roles

| Role | Who (pilot) | Primary device | Job in one line |
|---|---|---|---|
| **Owner** | Kumar / Kumaresh | Desktop + phone | Sees everything, approves discounts, final say |
| **Admin** | Office manager | Desktop | Manages users, price list, verifies payments, assigns work |
| **Accounts** | Accountant | Desktop | Verifies payments, records refunds, exports reports |
| **Sales** | Naren, Mallika, Viji, Vignesh, Dhanushya, Snegha, Murugan | Phone | Creates orders, records advances/payments, follows up |
| **Dispatch** | Workshop / dispatch in-charge | Phone | Moves orders through production → dispatch → delivered |

A user has exactly one role. Owner is a superset of Admin.

### 4.2 Permission matrix

Legend: ✅ full · 👤 own records only · 👁 read-only · ❌ none

| Capability | Owner | Admin | Accounts | Sales | Dispatch |
|---|---|---|---|---|---|
| Admin dashboard | ✅ | ✅ | 👁 (money tiles only) | ❌ | ❌ |
| Personal dashboard (My targets) | — | — | — | 👤 | 👤 (my queue) |
| Create order | ✅ | ✅ | ❌ | ✅ (salesperson = self) | ❌ |
| Create order on behalf of another salesperson | ✅ | ✅ | ❌ | ❌ | ❌ |
| View orders | ✅ | ✅ | ✅ | 👤 | ✅ (no prices) |
| Edit order lines/price **before** first dispatch | ✅ | ✅ | ❌ | 👤 (only while `PENDING_APPROVAL` or `CONFIRMED`) | ❌ |
| Edit order **after** first dispatch | ✅ | ✅ (reason required) | ❌ | ❌ | ❌ |
| Approve below-floor price | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel order | ✅ | ✅ | ❌ | 👤 request only → Admin approves | ❌ |
| Record payment | ✅ | ✅ | ✅ | 👤 (on own orders) | ❌ |
| Verify / reject payment | ✅ | ✅ | ✅ | ❌ | ❌ |
| Record refund | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update production/dispatch status | ✅ | ✅ | ❌ | ❌ | ✅ |
| Customers: create/edit | ✅ | ✅ | ✅ | ✅ (create, edit own customers' contact info) | ❌ |
| Price list: edit | ✅ | ✅ | ❌ | 👁 (customer price only) | ❌ |
| Price list: see dealer prices | ✅ | ✅ | ✅ | ❌ | ❌ |
| Users: manage | ✅ | ✅ (cannot create Owner) | ❌ | ❌ | ❌ |
| Targets: set | ✅ | ✅ | ❌ | ❌ | ❌ |
| Settings (entities, accounts, WhatsApp, thresholds) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Excel import | ✅ | ✅ | ❌ | ❌ | ❌ |
| Export reports | ✅ | ✅ | ✅ | 👤 | ❌ |
| Audit log | ✅ | 👁 | ❌ | ❌ | ❌ |

Permissions live in one file: `src/server/auth/permissions.ts`, as a typed map `can(role, action, resource?)`. Every Server Action calls `assertCan(...)` before touching data. **No permission checks in components only.** The UI hides what you can't do, and the server refuses it anyway.

---

## 5. Core workflows

### 5.1 Order lifecycle (state machine)

```
                    ┌──────────────────────┐
   price < floor ──▶│  PENDING_APPROVAL    │──reject──▶ CANCELLED (reason: price rejected)
                    └─────────┬────────────┘
                              │ approve
                              ▼
  create ─(price ok)─▶ ┌────────────┐  start   ┌───────────────┐  ready  ┌─────────┐
                       │ CONFIRMED  │────────▶ │ IN_PRODUCTION │───────▶ │  READY  │
                       └─────┬──────┘          └──────┬────────┘         └────┬────┘
                             │                        │                       │ dispatch (all or part)
                             │                        │                       ▼
                             │                        │              ┌──────────────────────┐
                             │                        │              │ PARTIALLY_DISPATCHED │
                             │                        │              └──────────┬───────────┘
                             │                        │                         │ remaining dispatched
                             │                        │                         ▼
                             │                        │                  ┌────────────┐ confirm ┌───────────┐
                             │                        │                  │ DISPATCHED │────────▶│ DELIVERED │
                             │                        │                  └────────────┘         └─────┬─────┘
                             │                        │                                               │ balance = 0
                             ▼                        ▼                                               ▼
                         CANCELLED ◀───────────── CANCELLED                                     ┌─────────┐
                     (before any dispatch only, reason mandatory)                             │ CLOSED  │ (auto)
                                                                                              └─────────┘
```

Rules:
- `CLOSED` is set **automatically** when status is `DELIVERED` **and** `balanceDue == 0`. It reopens to `DELIVERED` if a payment is later rejected.
- Stock items (e.g. a table-top grinder sold from the shelf) can go `CONFIRMED → DELIVERED` in one tap ("Handed over now"). This logs dispatch + delivery with today's date.
- `CANCELLED` is allowed only before any dispatch. Admin approval is required if the order has verified payments. Cancellation creates a **refund-due** amount equal to the verified payments. The refund is recorded as a `REFUND` payment.
- Every transition writes an `OrderEvent` (who, when, from → to, note).
- Allowed transitions are defined once in `src/domain/order/stateMachine.ts`. Unit tests cover every allowed and every forbidden transition.

**Cancellation reasons (enum, required):** `DELIVERY_DELAY`, `PRICE`, `CUSTOMER_CHANGED_MIND`, `FINANCIAL_ISSUE`, `WRONG_SPEC`, `DUPLICATE_ENTRY`, `OTHER` (with mandatory note).

### 5.2 Payment lifecycle

```
 Sales/Accounts records payment ──▶ PENDING_VERIFICATION ──verify──▶ VERIFIED
                                            │
                                            └──reject (reason)──▶ REJECTED
```

- Every payment has: amount, date, **method** (`CASH`, `UPI`, `BANK_TRANSFER`, `CHEQUE`, `CARD`), **received into** (one company `Account` or one `User` as personal receiver), reference no. (UTR/cheque no.), optional proof photo, and type (`ADVANCE`, `PART`, `FINAL`, `REFUND`).
- **Two different numbers are always shown:**
  - **Customer balance due** = order total − (VERIFIED + PENDING payments) + REFUNDS. This is what the customer still owes; we trust the salesperson's entry provisionally.
  - **Company-confirmed cash** = sum of VERIFIED only. Used for the Owner's money tiles.
- **Personal-receiver rule:** if `receivedInto` is a person (not a company account), the payment card shows an amber "With {name}" chip until an Admin/Accounts user marks it **"Deposited to company"** (records which account and date). Dashboard tile: **"Cash with staff"**, per person.
- Payments cannot exceed the balance due by more than ₹1 (rounding). Overpayment is blocked with a clear message.
- Cheque payments stay `PENDING_VERIFICATION` until marked cleared.

### 5.3 Dispatch

- Dispatch happens per **line item and quantity**, which supports partial delivery (e.g. Swaada Foods: 17 machines, delivered in stages).
- A dispatch record has: date, lines + qty, transport name, LR/docket number, vehicle no., freight amount (optional; can be billed to customer as a line), photos (max 4), note.
- On dispatch, offer a one-tap WhatsApp update to the customer (§13).
- Delivery confirmation: Dispatch user taps "Delivered" (optional photo or signature image).

### 5.4 Follow-up & reminders

- Each order with `balanceDue > 0` has an optional **promised payment date**.
- **Overdue** = `balanceDue > 0` AND (promised date < today OR (no promised date AND delivered > `settings.overdueGraceDays` [default 7] days ago)).
- Each salesperson sees their own **Collect** list. Admin sees everyone's.
- "Send reminder" sends the WhatsApp template `payment_reminder` and logs a `FollowUp` (channel, by whom, when, note).
- Optional auto-reminders (setting, default OFF): every N days for overdue orders, max 3, never on Sundays, 10:00–19:00 IST only.

### 5.5 Production-delay alert
- An order in `CONFIRMED` or `IN_PRODUCTION` longer than `settings.productionAlertDays` (default 10) or past its **promised delivery date** shows on the Admin dashboard under "Stuck orders" and on the Dispatch queue with a red age badge. This targets the #1 cancellation cause.

### 5.6 Price approval
- Each order line stores `listPrice` (customer price at time of order) and `unitPrice` (what was agreed).
- If `unitPrice < product.dealerPrice` (or `< customerPrice × (1 − settings.maxSalesDiscountPct)`, whichever is higher; default max discount 10%), the order goes to `PENDING_APPROVAL`. Owner/Admin approve or reject with a note. Sales gets an in-app notification.
- Custom / non-catalogue items (e.g. "SS table 5×2 per sketch") are allowed as **custom lines** (free-text name + price). They always need approval when above `settings.customLineApprovalAbove` (default ₹50,000).

---

## 6. Business rules (binding)

| ID | Rule |
|---|---|
| BR-01 | Money: `Decimal(14,2)` in DB, `decimal.js` in code. Rounding HALF_UP to paise. Display with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR', maximumFractionDigits:0})` unless paise ≠ 0. |
| BR-02 | Timezone: all timestamps stored UTC (`timestamptz`). All business dates ("order date", "payment date") are `date` type interpreted in IST. "Today" = today in IST. |
| BR-03 | Financial year: April–March. FY label `26-27` for 1 Apr 2026 – 31 Mar 2027. |
| BR-04 | Order number: `{ENTITY_CODE}/{FY}/{SEQ4}` e.g. `KI/26-27/0042`. Sequence per entity per FY, generated inside the create transaction using a `DocumentCounter` row locked with `SELECT … FOR UPDATE`. Never reused, even if cancelled. |
| BR-05 | Receipt number for payments: `RCPT/{FY}/{SEQ5}`, same mechanism. |
| BR-06 | Phone normalisation: strip spaces, `+91`, leading `0`. Must be 10 digits starting 6–9 for Indian numbers. International numbers allowed with `+` country code. Stored E.164 (`+919843722055`). |
| BR-07 | Customer uniqueness: `(tenantId, phoneE164)` unique. Typing an existing phone selects that customer and never creates a duplicate. |
| BR-08 | Order total = Σ(line qty × unitPrice) + Σ(charges: freight, installation, packing) − order-level discount. GST: each line has `gstRate` (default from product, default 18%, configurable). Pilot setting `pricesIncludeGst = true` (prices quoted inclusive, as in their sheets). Tax is shown as a breakup only. |
| BR-09 | `netReceived = Σ(non-REFUND payments with status ∈ {PENDING_VERIFICATION, VERIFIED}) − Σ(REFUND payments with status ∈ {PENDING_VERIFICATION, VERIFIED})`. `effectiveTotal = 0` if the order is CANCELLED, else `order.total`. `balanceDue = effectiveTotal − netReceived`. A **negative** balanceDue means **refund due to the customer** and is shown as "Refund due ₹X". Recomputed in the same DB transaction as any change. Unit-tested. |
| BR-10 | An order's salesperson is set at creation (self for Sales). Only Admin/Owner can reassign it, with a reason. Attribution for targets uses the salesperson at order date. |
| BR-11 | Order date defaults to today and cannot be in the future. Back-dating more than 7 days requires Admin/Owner. |
| BR-12 | Nothing is hard-deleted (except drafts never submitted). Users are deactivated, not deleted. Their history stays. |
| BR-13 | Every mutation writes `AuditLog { actorId, action, entity, entityId, before, after, at, ip, userAgent }`. |
| BR-14 | Billing entity (KI or KFM) is chosen per order (default from salesperson's profile). The order number prefix follows the entity. |
| BR-15 | Targets are monthly per salesperson in ₹ booked value. "Achieved" = Σ order totals (non-cancelled) with order date in that month. |

---

## 7. Data model (Prisma)

> Paste into `prisma/schema.prisma`. All IDs are `cuid()`. Every business model has `tenantId` + an index starting with `tenantId`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ───────────── Tenancy & identity ─────────────

model Tenant {
  id            String   @id @default(cuid())
  name          String
  slug          String   @unique
  createdAt     DateTime @default(now())
  settings      TenantSettings?
  entities      BillingEntity[]
  users         User[]
}

model TenantSettings {
  tenantId                 String  @id
  tenant                   Tenant  @relation(fields: [tenantId], references: [id])
  pricesIncludeGst         Boolean @default(true)
  defaultGstRate           Decimal @default(18) @db.Decimal(5, 2)
  maxSalesDiscountPct      Decimal @default(10) @db.Decimal(5, 2)
  customLineApprovalAbove  Decimal @default(50000) @db.Decimal(14, 2)
  overdueGraceDays         Int     @default(7)
  productionAlertDays      Int     @default(10)
  autoRemindersEnabled     Boolean @default(false)
  autoReminderEveryDays    Int     @default(5)
  autoReminderMaxCount     Int     @default(3)
  waPhoneNumberId          String?
  waBusinessAccountId      String?
  waAccessTokenEnc         String? // encrypted at rest (AES-256-GCM, key in env)
  waTemplatesJson          Json?
}

model BillingEntity {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  code      String   // "KI", "KFM"
  name      String   // "Kumaar Industries"
  gstin     String?
  address   String?
  phone     String?
  logoPath  String?
  active    Boolean  @default(true)
  accounts  Account[]
  orders    Order[]
  @@unique([tenantId, code])
}

enum Role { OWNER ADMIN ACCOUNTS SALES DISPATCH }
enum Lang { en ta }

model User {
  id               String   @id @default(cuid())
  tenantId         String
  tenant           Tenant   @relation(fields: [tenantId], references: [id])
  authUserId       String   @unique // Supabase auth.users.id
  name             String
  phoneE164        String
  role             Role
  lang             Lang     @default(en)
  defaultEntityId  String?
  active           Boolean  @default(true)
  canReceivePayments Boolean @default(false) // shows in "received into" list
  createdAt        DateTime @default(now())
  lastLoginAt      DateTime?
  ordersAsSales    Order[]  @relation("OrderSalesperson")
  targets          SalesTarget[]
  @@unique([tenantId, phoneE164])
  @@index([tenantId, role, active])
}

model SalesTarget {
  id        String  @id @default(cuid())
  tenantId  String
  userId    String
  user      User    @relation(fields: [userId], references: [id])
  month     DateTime @db.Date // first day of month (IST)
  amount    Decimal @db.Decimal(14, 2)
  @@unique([tenantId, userId, month])
}

// ───────────── Money destinations ─────────────

enum AccountKind { BANK UPI CASH_DRAWER }

model Account {
  id         String      @id @default(cuid())
  tenantId   String
  entityId   String
  entity     BillingEntity @relation(fields: [entityId], references: [id])
  label      String      // "KFM Current A/c (HDFC)", "KI UPI Scanner"
  kind       AccountKind
  last4      String?
  active     Boolean     @default(true)
  @@index([tenantId, active])
}

// ───────────── Catalogue ─────────────

model ProductCategory {
  id        String    @id @default(cuid())
  tenantId  String
  name      String    // "Wet Grinders", "Pulverizers", "Turbo Stoves"
  sortOrder Int       @default(0)
  products  Product[]
  @@unique([tenantId, name])
}

model Product {
  id                    String   @id @default(cuid())
  tenantId              String
  categoryId            String
  category              ProductCategory @relation(fields: [categoryId], references: [id])
  name                  String   // "10L Tilting Wet Grinder"
  spec                  String?  // "1 HP", "SS 304", "50 kg/hr"
  searchText            String   // lowercased name+spec+aliases for fast search
  aliases               String[] // "10 ltr tilting", "10l tt", "t/w/g 10"
  dealerPriceWoMotor    Decimal? @db.Decimal(14, 2)
  dealerPrice           Decimal? @db.Decimal(14, 2)
  customerPrice         Decimal? @db.Decimal(14, 2)
  gstRate               Decimal? @db.Decimal(5, 2)
  isStockItem           Boolean  @default(false) // can be "handed over now"
  active                Boolean  @default(true)
  updatedAt             DateTime @updatedAt
  priceHistory          ProductPriceHistory[]
  @@index([tenantId, active])
}

model ProductPriceHistory {
  id                 String   @id @default(cuid())
  productId          String
  product            Product  @relation(fields: [productId], references: [id])
  dealerPriceWoMotor Decimal? @db.Decimal(14, 2)
  dealerPrice        Decimal? @db.Decimal(14, 2)
  customerPrice      Decimal? @db.Decimal(14, 2)
  changedById        String
  changedAt          DateTime @default(now())
}

// ───────────── Customers ─────────────

enum CustomerType { END_CUSTOMER DEALER INSTITUTION }

model Customer {
  id          String       @id @default(cuid())
  tenantId    String
  name        String       // person or business name
  businessName String?
  phoneE164   String
  altPhone    String?
  type        CustomerType @default(END_CUSTOMER)
  city        String?
  state       String?      // default "Tamil Nadu"
  gstin       String?
  address     String?
  notes       String?
  ownerUserId String?      // salesperson who brought them
  createdAt   DateTime     @default(now())
  orders      Order[]
  @@unique([tenantId, phoneE164])
  @@index([tenantId, name])
}

// ───────────── Orders ─────────────

enum OrderStatus {
  PENDING_APPROVAL
  CONFIRMED
  IN_PRODUCTION
  READY
  PARTIALLY_DISPATCHED
  DISPATCHED
  DELIVERED
  CLOSED
  CANCELLED
}

enum CancelReason {
  DELIVERY_DELAY PRICE CUSTOMER_CHANGED_MIND FINANCIAL_ISSUE WRONG_SPEC DUPLICATE_ENTRY OTHER
}

enum OrderSource { APP IMPORT }

model Order {
  id                    String      @id @default(cuid())
  tenantId              String
  number                String      // KI/26-27/0042
  entityId              String
  entity                BillingEntity @relation(fields: [entityId], references: [id])
  customerId            String
  customer              Customer    @relation(fields: [customerId], references: [id])
  salespersonId         String
  salesperson           User        @relation("OrderSalesperson", fields: [salespersonId], references: [id])
  orderDate             DateTime    @db.Date
  promisedDeliveryDate  DateTime?   @db.Date
  promisedPaymentDate   DateTime?   @db.Date
  status                OrderStatus @default(CONFIRMED)
  subtotal              Decimal     @db.Decimal(14, 2)
  chargesTotal          Decimal     @default(0) @db.Decimal(14, 2)
  discount              Decimal     @default(0) @db.Decimal(14, 2)
  total                 Decimal     @db.Decimal(14, 2)
  balanceDue            Decimal     @db.Decimal(14, 2) // derived cache, BR-09
  needsApproval         Boolean     @default(false)
  approvalNote          String?
  approvedById          String?
  approvedAt            DateTime?
  cancelReason          CancelReason?
  cancelNote            String?
  notes                 String?
  source                OrderSource @default(APP)
  importRef             String?     // "VIJI!R142"
  createdById           String
  createdAt             DateTime    @default(now())
  updatedAt             DateTime    @updatedAt
  lines                 OrderLine[]
  charges               OrderCharge[]
  payments              Payment[]
  dispatches            Dispatch[]
  events                OrderEvent[]
  followUps             FollowUp[]
  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, salespersonId, orderDate])
  @@index([tenantId, customerId])
  @@index([tenantId, balanceDue])
}

model OrderLine {
  id            String   @id @default(cuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id])
  productId     String?  // null = custom line
  product       Product? @relation(fields: [productId], references: [id])
  description   String   // snapshot of product name+spec, or custom text
  qty           Int
  listPrice     Decimal? @db.Decimal(14, 2) // customerPrice at time of order
  floorPrice    Decimal? @db.Decimal(14, 2) // dealerPrice at time of order
  unitPrice     Decimal  @db.Decimal(14, 2)
  gstRate       Decimal  @db.Decimal(5, 2)
  lineTotal     Decimal  @db.Decimal(14, 2)
  dispatchedQty Int      @default(0)
  sortOrder     Int      @default(0)
}

enum ChargeKind { FREIGHT INSTALLATION PACKING OTHER }

model OrderCharge {
  id        String     @id @default(cuid())
  orderId   String
  order     Order      @relation(fields: [orderId], references: [id])
  kind      ChargeKind
  label     String
  amount    Decimal    @db.Decimal(14, 2)
}

model OrderEvent {
  id         String   @id @default(cuid())
  orderId    String
  order      Order    @relation(fields: [orderId], references: [id])
  actorId    String
  type       String   // STATUS_CHANGE | EDIT | APPROVAL | NOTE | REASSIGN
  fromStatus OrderStatus?
  toStatus   OrderStatus?
  note       String?
  at         DateTime @default(now())
  @@index([orderId, at])
}

// ───────────── Payments ─────────────

enum PaymentMethod { CASH UPI BANK_TRANSFER CHEQUE CARD }
enum PaymentType   { ADVANCE PART FINAL REFUND }
enum PaymentStatus { PENDING_VERIFICATION VERIFIED REJECTED }

model Payment {
  id                 String        @id @default(cuid())
  tenantId           String
  receiptNo          String
  orderId            String
  order              Order         @relation(fields: [orderId], references: [id])
  type               PaymentType
  method             PaymentMethod
  amount             Decimal       @db.Decimal(14, 2)
  paidOn             DateTime      @db.Date
  receivedIntoAccountId String?    // company account
  receivedByUserId   String?       // person, when not a company account
  referenceNo        String?       // UTR / cheque no.
  proofPath          String?       // Supabase Storage path
  status             PaymentStatus @default(PENDING_VERIFICATION)
  verifiedById       String?
  verifiedAt         DateTime?
  rejectReason       String?
  depositedToAccountId String?     // when cash/personal UPI moved to company
  depositedOn        DateTime?     @db.Date
  note               String?
  createdById        String
  createdAt          DateTime      @default(now())
  @@unique([tenantId, receiptNo])
  @@index([tenantId, status])
  @@index([tenantId, receivedByUserId, depositedOn])
  // CHECK: exactly one of receivedIntoAccountId / receivedByUserId is set (SQL migration)
}

// ───────────── Dispatch ─────────────

model Dispatch {
  id            String   @id @default(cuid())
  orderId       String
  order         Order    @relation(fields: [orderId], references: [id])
  dispatchedOn  DateTime @db.Date
  transporter   String?
  lrNumber      String?
  vehicleNo     String?
  photoPaths    String[]
  note          String?
  deliveredOn   DateTime? @db.Date
  deliveryProofPath String?
  createdById   String
  lines         DispatchLine[]
}

model DispatchLine {
  id          String   @id @default(cuid())
  dispatchId  String
  dispatch    Dispatch @relation(fields: [dispatchId], references: [id])
  orderLineId String
  qty         Int
}

// ───────────── Follow-ups, notifications, counters, audit ─────────────

enum FollowUpChannel { WHATSAPP CALL VISIT OTHER }

model FollowUp {
  id        String          @id @default(cuid())
  orderId   String
  order     Order           @relation(fields: [orderId], references: [id])
  channel   FollowUpChannel
  note      String?
  nextOn    DateTime?       @db.Date
  byUserId  String
  at        DateTime        @default(now())
}

model Notification {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  kind      String   // APPROVAL_NEEDED | APPROVED | REJECTED | PAYMENT_REJECTED | ORDER_STUCK | CANCEL_REQUEST
  title     String
  body      String
  link      String
  readAt    DateTime?
  createdAt DateTime @default(now())
  @@index([tenantId, userId, readAt])
}

model WhatsAppMessage {
  id          String   @id @default(cuid())
  tenantId    String
  orderId     String?
  toE164      String
  template    String
  paramsJson  Json
  waMessageId String?
  status      String   // QUEUED | SENT | DELIVERED | READ | FAILED | DEEPLINK
  error       String?
  sentById    String?
  createdAt   DateTime @default(now())
  @@index([tenantId, orderId])
}

model DocumentCounter {
  tenantId  String
  key       String   // "ORDER:KI:26-27" | "RCPT:26-27"
  value     Int      @default(0)
  @@id([tenantId, key])
}

model AuditLog {
  id        String   @id @default(cuid())
  tenantId  String
  actorId   String?
  action    String
  entity    String
  entityId  String
  before    Json?
  after     Json?
  ip        String?
  userAgent String?
  at        DateTime @default(now())
  @@index([tenantId, entity, entityId])
  @@index([tenantId, at])
}

model ImportBatch {
  id          String   @id @default(cuid())
  tenantId    String
  fileName    String
  status      String   // PARSED | COMMITTED | FAILED
  summaryJson Json
  rowsJson    Json     // normalized rows + issues, for preview
  createdById String
  createdAt   DateTime @default(now())
}
```

Raw SQL migration additions (`prisma/migrations/*/extra.sql`):
- `CHECK ((received_into_account_id IS NULL) <> (received_by_user_id IS NULL))` on `Payment`.
- `CHECK (qty > 0)` on `OrderLine`. `CHECK (amount > 0)` on `Payment`.
- Enable RLS on all tables. With no policies for `anon`/`authenticated` roles, the browser cannot read anything directly (D3).

---

## 8. Architecture

```
┌────────────────────────── Browser / PWA (Android-first) ───────────────────────────┐
│ Next.js App Router · React Server Components · Client islands for forms           │
│ next-intl (en/ta) · TanStack Query only where live refresh is needed              │
└───────────────────────────────▲───────────────────────────────────────────────────┘
                                │ Server Actions / Route Handlers (HTTPS)
┌───────────────────────────────┴───────────────────────────────────────────────────┐
│ src/server                                                                          │
│  auth/        getSession(), assertCan(), permissions.ts                             │
│  repo/        tenant-scoped repositories (every query injects tenantId)             │
│  domain/      pure logic: money.ts, order/stateMachine.ts, order/totals.ts,         │
│               payment/balance.ts, numbering.ts, phone.ts, fy.ts  (100% unit-tested) │
│  services/    orderService, paymentService, dispatchService, dashboardService,      │
│               whatsappService, importService (orchestrate repo + domain + audit)    │
│  jobs/        reminders.ts, stuckOrders.ts (run by Vercel Cron / pg_cron)           │
└───────────────────────────────▲───────────────────────────────────────────────────┘
                                │ Prisma (pooled) 
┌───────────────────────────────┴──────────────┐   ┌──────────────────────────────┐
│ Supabase Postgres (RLS on, server-only access)│   │ Supabase Storage (private)   │
│ Supabase Auth (phone + password, admin-made)  │   │ proofs/, dispatch/, logos/   │
└───────────────────────────────────────────────┘   └──────────────────────────────┘
                                │
                     Meta WhatsApp Cloud API (send + webhook GET/POST)
```

**Layer rules**
- `domain/` has zero imports from Next, Prisma or React. Pure functions only.
- Components never import Prisma.
- Every Server Action follows the same shape: `parse (zod) → getSession → assertCan → service → revalidatePath → return {ok, data} | {ok:false, error:{code, message}}`.
- Errors use a typed `AppError(code, userMessage, meta)`. UI maps `code` to a translated message. Unknown errors show "Something went wrong — reference #<id>". The same id goes to the logs (Sentry or Logflare).

**Folder structure**
```
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx                 # role-aware shell
    (app)/home/page.tsx              # role-specific home
    (app)/orders/page.tsx            # list
    (app)/orders/new/page.tsx        # 3-step wizard
    (app)/orders/[id]/page.tsx       # detail
    (app)/collect/page.tsx           # balances to collect
    (app)/payments/verify/page.tsx   # verification queue
    (app)/dispatch/page.tsx          # board
    (app)/customers/...              
    (app)/catalogue/...              # price list
    (app)/dashboard/page.tsx         # admin dashboard
    (app)/reports/page.tsx
    (app)/settings/{users,entities,accounts,targets,whatsapp,general,import}/page.tsx
    api/whatsapp/webhook/route.ts    # GET verify + POST status
    api/cron/{reminders,stuck}/route.ts
  components/ui/                     # restyled shadcn primitives
  components/app/                    # Money, StatusPill, OrderCard, PhoneInput, ProductPicker…
  server/{auth,repo,domain,services,jobs}/
  i18n/{en,ta}.json
  config/brand.ts
prisma/schema.prisma, seed.ts
tests/{unit,integration,e2e}/
docs/evidence/phase-N.md
```

---

## 9. Dashboard metric definitions (exact)

All money values are for the selected period (default: this month, IST) and exclude `CANCELLED` orders unless stated.

| Tile / chart | Definition |
|---|---|
| **Booked** | Σ `order.total` where `orderDate` in period |
| **Collected (verified)** | Σ `payment.amount` (type ≠ REFUND) where `status = VERIFIED` and `paidOn` in period, minus verified refunds in period |
| **Awaiting verification** | Σ amount, count of payments `PENDING_VERIFICATION` (all time) |
| **Cash with staff** | Σ amount of non-rejected payments where `receivedByUserId` set and `depositedOn` null, grouped by person (all time) |
| **Outstanding** | Σ `balanceDue` where `balanceDue > 0`, non-cancelled orders (all time). Negative balances (refunds due) appear in a separate "Refunds due" line under Needs action |
| **Overdue** | Outstanding filtered by the §5.4 rule. Aging buckets 0–15 / 16–30 / 31–60 / 60+ days |
| **Stuck orders** | §5.5 rule. Count + list |
| **Pending approvals** | count `PENDING_APPROVAL` |
| **Sales leaderboard** | per salesperson: booked, target, % achieved, orders, avg order value, collected (verified, on their orders) |
| **Booked trend** | booked per month, last 12 months (bar) |
| **Top products** | by qty and by value in period |
| **Top customers** | by booked value in period. Repeat-customer count (≥ 2 orders all time) |
| **Cancellations** | count + value by reason in period |

Every tile is clickable and opens the filtered list that produces the number (no dead-end numbers).

---

## 10. Design system — "Sovereign"

**Principle: precision over decoration.** The interface feels like a well-made instrument: calm, exact, fast. **One gold accent per screen**, used for the single most important action or number on that screen. Nothing else is gold.

### 10.1 Tokens (`src/app/globals.css`, Tailwind v4 `@theme`)

```css
:root {
  /* Surfaces */
  --bg:            #F7F6F2;  /* warm paper */
  --surface:       #FFFFFF;
  --surface-2:     #F0EEE8;
  --border:        #E3E0D8;
  --border-strong: #CFCBC1;

  /* Ink */
  --ink:           #121316;  /* primary text */
  --ink-2:         #4A4C52;  /* secondary */
  --ink-3:         #7D7F86;  /* tertiary / hints */

  /* The one accent */
  --gold:          #B08A3E;
  --gold-ink:      #1A1408;  /* text on gold */
  --gold-soft:     #F3EAD6;  /* only as the gold element's own hover/focus halo */

  /* Status (muted, never compete with gold) */
  --ok:            #2F6B4F;  --ok-bg:     #E6F0EA;
  --warn:          #8A5A12;  --warn-bg:   #F6ECDA;
  --danger:        #9B2C2C;  --danger-bg: #F6E3E3;
  --info:          #2D4F7C;  --info-bg:   #E4EBF4;

  --radius-sm: 6px; --radius: 10px; --radius-lg: 14px;
  --shadow-1: 0 1px 2px rgba(18,19,22,.06);
  --shadow-2: 0 6px 24px rgba(18,19,22,.08);
}
:root[data-theme="dark"] {
  --bg:#0E0F11; --surface:#16171A; --surface-2:#1C1E22; --border:#2A2C31; --border-strong:#3A3D44;
  --ink:#F2F1EE; --ink-2:#B7B8BD; --ink-3:#85878E;
  --gold:#C9A25A; --gold-ink:#16120A; --gold-soft:#2B2416;
  --ok:#7FC3A0; --ok-bg:#16261E; --warn:#E0B26A; --warn-bg:#2A2114;
  --danger:#E39191; --danger-bg:#2C1818; --info:#93B4E0; --info-bg:#172131;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* same as dark block */ } }
```

Dark mode: available for Admin/Owner desktop (toggle in profile). Sales/Dispatch default to light (outdoor readability).

### 10.2 Typography
- **UI:** Inter (variable), with `font-feature-settings: "tnum" 1, "cv11" 1` on all numbers.
- **Tamil:** Noto Sans Tamil, loaded only when `lang = ta`.
- **Numbers & codes** (order no., amounts in tables): Inter tabular. **No monospace fonts** except in the audit log JSON viewer.
- Scale (px): 12 / 14 / 16 (body) / 18 / 22 / 28 / 36 (hero figures only). Line-height 1.45 body, 1.2 headings. Minimum body size on mobile is **16px**. Field staff should never need to zoom.
- Labels: 12px, uppercase, letter-spacing .06em, `--ink-3`. Used for section titles ("TO COLLECT").

### 10.3 Layout & spacing
- 4-pt grid. Spacing tokens 4, 8, 12, 16, 24, 32, 48.
- Mobile: 16px side gutter, max width 480px, bottom nav 64px, **touch targets ≥ 48×48px**.
- Desktop: 240px left sidebar (collapsible to 72px), content max width 1280px, 24px gutters.
- Cards: `--surface`, 1px `--border`, `--radius`, `--shadow-1`. No gradients. No decorative illustrations. Icons: Lucide, 20px, stroke 1.75.

### 10.4 The gold rule (enforced)
- Exactly one element per screen gets `variant="gold"`. A dev-only `<GoldAudit/>` component counts `[data-gold]` nodes and shows a red badge in development if the count ≠ 1.
- The gold element per screen is listed in each wireframe (§11) as **[GOLD]**.

### 10.5 Core components (`components/app/`)
| Component | Spec |
|---|---|
| `Money` | Renders ₹ with Indian grouping, tabular numbers. Props: `value: Decimal`, `size`, `muted`, `signed`. Negative values in `--danger` with a minus sign (never parentheses). |
| `StatusPill` | Order/payment status. Colour map: CONFIRMED=info, IN_PRODUCTION=info, READY=ok-outline, PARTIALLY_DISPATCHED/DISPATCHED=info-outline, DELIVERED=ok, CLOSED=neutral, PENDING_APPROVAL=warn, CANCELLED=danger, PENDING_VERIFICATION=warn, VERIFIED=ok, REJECTED=danger. Text always present, never colour-only. |
| `PaymentChip` | "Paid", "Part-paid ₹X due", "Unpaid", "With Naren ₹X" (amber). |
| `PhoneInput` | +91 fixed prefix, numeric keypad, live validation, shows matched customer card instantly (debounced 250ms). |
| `ProductPicker` | Full-screen sheet on mobile. Search by name/alias/spec, category chips, recent items first. Shows customer price. Dealer price only for allowed roles. |
| `QtyStepper` | − [ 1 ] + with 48px buttons. |
| `OrderCard` | Number, customer, total, balance chip, status pill, age. |
| `EmptyState` | One sentence + one action. No illustrations. |
| `ConfirmSheet` | Bottom sheet for destructive or irreversible actions, with the reason field when required. |
| `Toast` | Bottom (mobile) / top-right (desktop). Success auto-hides at 3s. Errors persist until dismissed and include a reference id. |

### 10.6 Motion & feedback
- 150ms ease-out for sheets/menus. No motion on numbers except a single 400ms count-up on dashboard hero figures (respects `prefers-reduced-motion`).
- Every button shows a pending state (spinner + disabled) while its action runs. Double-submit is impossible (idempotency key per form submit, §14).

### 10.7 Accessibility
- WCAG 2.2 AA contrast (checked for both themes). Gold on paper is used for fills with `--gold-ink` text, never for small text on white.
- All inputs labelled. Errors linked via `aria-describedby`. Focus ring 2px `--ink`, offset 2px.
- Full keyboard support on desktop. Lighthouse Accessibility ≥ 95 on every page.

### 10.8 Language
- Every user-visible string comes from `i18n/en.json` / `i18n/ta.json`. The language toggle is in the header (`EN | த`) and in the profile.
- Tamil copy is reviewed by a native speaker before go-live (§21 open question Q4).

---

## 11. Screens & wireframes

### 11.0 Navigation map

```
Sales (mobile bottom nav):     Home · Orders · Collect · Me   (New order = sticky gold button on Home and Orders)
Dispatch (mobile bottom nav):  Queue · Board · Me
Owner/Admin (desktop sidebar): Dashboard · Orders · Payments (Verify, Cash with staff) · Collect ·
                               Dispatch · Customers · Price List · Reports · Settings
Accounts (desktop sidebar):    Payments · Collect · Orders · Customers · Reports
```

### 11.1 Login (all roles)  — [GOLD] = "Sign in" button

```
┌──────────────────────────────────┐
│                                  │
│   SALESOS                EN | த  │
│   KI · KFM                       │
│                                  │
│   Mobile number                  │
│   ┌────┬───────────────────────┐ │
│   │ +91│ 98437 22055           │ │
│   └────┴───────────────────────┘ │
│   Password                       │
│   ┌───────────────────────────┐  │
│   │ ••••••••            [show]│  │
│   └───────────────────────────┘  │
│                                  │
│   ┌───────────────────────────┐  │
│   │        SIGN IN            │◀─ GOLD
│   └───────────────────────────┘  │
│   Forgot password? Ask your admin│
└──────────────────────────────────┘
```
- Wrong credentials → "Mobile number or password is wrong." (never reveals which one). Deactivated user → "Your account is turned off. Contact your admin."
- Session lasts 30 days on the device. "Sign out of all devices" is in the profile.

### 11.2 Sales — Home  — [GOLD] = "＋ New order"

```
┌──────────────────────────────────┐
│ SALESOS             EN|த   (VJ)  │
│ Good morning, Viji               │
├──────────────────────────────────┤
│ OCTOBER                          │
│ ₹5,45,690            of ₹15,00,000│
│ ███████░░░░░░░░░░░░░  36%        │
│ 17 orders · avg ₹32,099          │
├──────────────────────────────────┤
│ TO COLLECT                  ›    │
│ ₹1,84,300  from 7 customers      │
│ ⚠ 3 overdue · ₹96,500            │
├──────────────────────────────────┤
│ NEEDS YOU                        │
│ • 1 price approval rejected   ›  │
│ • 2 payments rejected         ›  │
├──────────────────────────────────┤
│ RECENT ORDERS                    │
│ KI/26-27/0412  Gokul     ₹24,000 │
│ [In production]  ₹14,000 due     │
│ KI/26-27/0409  Rew       ₹37,010 │
│ [Delivered]      ₹27,010 due     │
│ KFM/26-27/0388 Akchaya   ₹18,250 │
│ [Closed]         Paid            │
│                    See all  ›    │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │       ＋  NEW ORDER          │◀─ GOLD (sticky above nav)
│ └──────────────────────────────┘ │
├──────────────────────────────────┤
│ ⌂Home  ☰Orders  ₹Collect  ◯Me    │
└──────────────────────────────────┘
```

### 11.3 New order — 3 steps (mobile)  — [GOLD] = the step's primary button

**Step 1 · Customer**
```
┌──────────────────────────────────┐
│ ←  New order            1 of 3   │
│ ●━━━━━━○──────○                   │
├──────────────────────────────────┤
│ Customer mobile                  │
│ ┌────┬───────────────────────┐   │
│ │ +91│ 99436 22055           │   │
│ └────┴───────────────────────┘   │
│ ┌──────────────────────────────┐ │
│ │ ✓ SRI PACK  · Dealer         │ │  ← auto-matched existing customer
│ │   Coimbatore · 13 orders     │ │
│ │   Last: Halwa machine, 9 Oct │ │
│ │   Balance due ₹35,000  ⚠     │ │
│ └──────────────────────────────┘ │
│                                  │
│ — if no match —                  │
│ Name*          [               ] │
│ Business name  [               ] │
│ City           [Coimbatore    ▾] │
│ Type   (●) Customer ( ) Dealer   │
│        ( ) Institution           │
│ ▸ More (GSTIN, address, alt ph.) │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐ │
│ │          NEXT  →             │◀─ GOLD
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

**Step 2 · Machines**
```
┌──────────────────────────────────┐
│ ←  New order            2 of 3   │
│ ●━━━━━━●━━━━━━○                   │
├──────────────────────────────────┤
│ 🔍 Search machine… "10l tilt"     │
│ [Recent] [Grinders] [IRG] [Stoves]│
│ [Kneaders] [Pulverizers] [Veg] ›  │
├──────────────────────────────────┤
│ 10L Tilting Wet Grinder · 1 HP   │
│ List ₹32,000                     │
│ Price  [ 29,500 ]   − [ 1 ] +    │
│ ⚠ 7.8% below list                │
│                          ₹29,500 │
│ ─────────────────────────────────│
│ 6" IRG · 2 HP · SS               │
│ List ₹36,000                     │
│ Price  [ 33,000 ]   − [ 1 ] +    │
│                          ₹33,000 │
│ ─────────────────────────────────│
│ ＋ Add machine   ＋ Custom item    │
│ ＋ Freight / installation         │
├──────────────────────────────────┤
│ Subtotal               ₹62,500   │
│ ┌──────────────────────────────┐ │
│ │          NEXT  →             │◀─ GOLD
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```
- Price below floor → inline amber note: "Needs owner approval. The order will be saved and sent for approval." It never blocks the salesperson.

**Step 3 · Payment & confirm**
```
┌──────────────────────────────────┐
│ ←  New order            3 of 3   │
│ ●━━━━━━●━━━━━━●                   │
├──────────────────────────────────┤
│ SRI PACK · 99436 22055           │
│ 2 machines              ₹62,500  │
│ Bill from   (●) KI   ( ) KFM     │
│ Delivery by [ 18 Oct 2026  📅 ]  │
├──────────────────────────────────┤
│ ADVANCE RECEIVED NOW?            │
│ Amount   [ 20,000            ]   │
│ Method   [Cash][UPI][Bank][Chq]  │
│ Received into                    │
│   (●) KFM Current A/c            │
│   ( ) KI UPI Scanner             │
│   ( ) Me (Viji)                  │
│ UTR / Ref [               ]      │
│ 📷 Add payment screenshot        │
│ Pay balance by [ 25 Oct 📅 ]     │
├──────────────────────────────────┤
│ Note [                         ] │
├──────────────────────────────────┤
│ Total ₹62,500 · Advance ₹20,000  │
│ Balance after advance ₹42,500    │
│ ┌──────────────────────────────┐ │
│ │       CONFIRM ORDER          │◀─ GOLD
│ └──────────────────────────────┘ │
│ ☐ Send WhatsApp confirmation     │  (default ON if customer has WhatsApp)
└──────────────────────────────────┘
```
- On success: full-screen confirmation with the order number in large type, "Share on WhatsApp" and "Done".
- Drafts autosave locally (IndexedDB) after every field change. Reopening "New order" offers "Continue draft from 10:42?".

### 11.4 Order detail  — [GOLD] = "Record payment" (if balance > 0), otherwise the next status action

```
┌──────────────────────────────────┐
│ ←  KI/26-27/0412          ⋯      │
│ [In production]  [₹14,000 due]   │
├──────────────────────────────────┤
│ GOKUL · 99xxxxxx12   📞  WhatsApp │
│ Salesperson Viji · 8 Oct 2026    │
│ Delivery promised 15 Oct (5 days)│
├──────────────────────────────────┤
│ MACHINES                         │
│ 15kg Potato Peeler × 1   ₹24,000 │
│   dispatched 0 / 1               │
├──────────────────────────────────┤
│ MONEY                            │
│ Total                    ₹24,000 │
│ Paid (verified)          ₹10,000 │
│ Awaiting verification        ₹0  │
│ Balance due              ₹14,000 │
│ ┌──────────────────────────────┐ │
│ │      ₹ RECORD PAYMENT        │◀─ GOLD
│ └──────────────────────────────┘ │
│ RCPT/26-27/01231  ₹10,000 UPI    │
│ into Naren (personal) · Verified │
├──────────────────────────────────┤
│ TIMELINE                         │
│ 08 Oct 11:02  Created by Viji    │
│ 08 Oct 11:02  Advance ₹10,000    │
│ 09 Oct 09:30  → In production    │
│ 10 Oct 17:15  Reminder sent (WA) │
├──────────────────────────────────┤
│ [Send reminder] [Add note]       │
│ [Request cancel]                 │
└──────────────────────────────────┘
```
Desktop version: two columns (left: machines + timeline, right: money + customer). Same content.

### 11.5 Record payment (bottom sheet)  — [GOLD] = "Save payment"

```
┌──────────────────────────────────┐
│ Record payment       KI/…/0412 ✕ │
│ Balance due ₹14,000              │
│ Amount   [ 14,000 ]  [Full ✓]    │
│ Date     [ Today, 10 Oct  📅 ]   │
│ Method   [Cash][UPI][Bank][Chq]  │
│ Received into  [KFM Current A/c▾]│
│ UTR / Ref [               ]      │
│ 📷 Screenshot (optional)         │
│ ┌──────────────────────────────┐ │
│ │        SAVE PAYMENT          │◀─ GOLD
│ └──────────────────────────────┘ │
│ Goes to Accounts for verification│
└──────────────────────────────────┘
```

### 11.6 Collect (Sales: own · Admin/Accounts: all)  — [GOLD] = total outstanding figure

```
┌──────────────────────────────────┐
│ Collect                          │
│ ₹1,84,300  outstanding     ◀─ GOLD (figure)
│ [All] [Overdue 3] [This week] [Promised today]
├──────────────────────────────────┤
│ ⚠ Rew · 3 orders        ₹27,010  │
│   overdue 18 days · last WA 2d   │
│   [📞] [WhatsApp] [Promise date]  │
│ ─────────────────────────────────│
│   Gokul                 ₹14,000  │
│   due 25 Oct · in production     │
│   [📞] [WhatsApp] [Promise date]  │
│ …                                │
└──────────────────────────────────┘
```
Grouped by customer. Tapping a row opens the customer's orders with balances.

### 11.7 Admin dashboard (desktop)  — [GOLD] = "Collected (verified)" hero figure

```
┌──────────┬───────────────────────────────────────────────────────────────────────────────────────┐
│ SALESOS  │ Dashboard                     [This month ▾]  [KI+KFM ▾]            🔔3   (KM) EN|த   │
│          ├───────────────────────────────────────────────────────────────────────────────────────┤
│ Dashboard│ ┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐       │
│ Orders   │ │ BOOKED       ││ COLLECTED ✓  ││ AWAITING     ││ CASH WITH    ││ OUTSTANDING  │       │
│ Payments │ │ ₹18,92,400   ││ ₹12,40,800   ││ VERIFICATION ││ STAFF        ││ ₹64,38,200   │       │
│ Collect  │ │ ▲ 12% vs Sep ││  ◀─ GOLD     ││ ₹2,15,000 ·9 ││ ₹1,38,500 ·4 ││ overdue ₹31L │       │
│ Dispatch │ └──────────────┘└──────────────┘└──────────────┘└──────────────┘└──────────────┘       │
│ Customers│                                                                                         │
│ Price    │ ┌───────────────────────────────────────────┐ ┌───────────────────────────────────────┐ │
│ Reports  │ │ BOOKED · LAST 12 MONTHS                   │ │ NEEDS ACTION                          │ │
│ Settings │ │  ▇                                        │ │ 3 price approvals            Review › │ │
│          │ │  ▇     ▇  ▇                               │ │ 9 payments to verify         Verify › │ │
│          │ │ ▇▇ ▇ ▇ ▇▇ ▇                               │ │ 5 stuck orders (>10 days)      View › │ │
│          │ │ ─────────────────────────                 │ │ 2 cancel requests            Review › │ │
│          │ │ N D J F M A M J J A S O                   │ └───────────────────────────────────────┘ │
│          │ └───────────────────────────────────────────┘                                           │
│          │ ┌───────────────────────────────────────────────────────────────────────────────────┐ │
│          │ │ SALES TEAM            Booked     Target     %    Orders   Avg      Collected      │ │
│          │ │ Vignesh             ₹4,21,000  ₹6,00,000   70%    30    ₹14,033   ₹3,10,000       │ │
│          │ │ Mallika             ₹3,24,500  ₹5,00,000   65%    29    ₹11,190   ₹2,98,000       │ │
│          │ │ Viji                ₹5,45,690  ₹15,00,000  36%    17    ₹32,099   ₹2,02,000       │ │
│          │ │ …                                                                                 │ │
│          │ └───────────────────────────────────────────────────────────────────────────────────┘ │
│          │ ┌─────────────────────────────┐ ┌──────────────────────────┐ ┌──────────────────────┐ │
│          │ │ OVERDUE AGING               │ │ TOP MACHINES (qty)       │ │ CANCELLATIONS        │ │
│          │ │ 0–15   ₹6.2L  ███           │ │ 6" IRG            14     │ │ Delivery delay  4    │ │
│          │ │ 16–30  ₹9.8L  █████         │ │ 10L Tilting       11     │ │ Price           1    │ │
│          │ │ 31–60  ₹8.1L  ████          │ │ 10kg Potato peel.  9     │ │ Financial       1    │ │
│          │ │ 60+    ₹7.2L  ████          │ │ 5kg Turbo stove    8     │ │                      │ │
│          │ └─────────────────────────────┘ └──────────────────────────┘ └──────────────────────┘ │
└──────────┴───────────────────────────────────────────────────────────────────────────────────────┘
```
Owner on mobile gets the same tiles stacked, plus the "Needs action" list at the top.

### 11.8 Payments — Verify queue (Admin/Accounts)  — [GOLD] = "Verify selected"

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Verify payments   9 waiting · ₹2,15,000      [Received into ▾] [Method ▾] [Salesperson ▾] │
├───┬────────────────┬──────────────┬──────────┬────────┬──────────────────┬────────┬────────┤
│ ☐ │ Receipt        │ Order        │ Amount   │ Method │ Received into    │ Proof  │        │
├───┼────────────────┼──────────────┼──────────┼────────┼──────────────────┼────────┼────────┤
│ ☐ │ RCPT/…/01240   │ KI/…/0412    │ ₹14,000  │ UPI    │ KFM Current A/c  │ 🖼      │ ✓  ✕   │
│ ☐ │ RCPT/…/01241   │ KFM/…/0390   │ ₹40,000  │ Cash   │ Naren (personal) │ —      │ ✓  ✕   │
│ ☐ │ RCPT/…/01242   │ KI/…/0401    │ ₹1,00,000│ Cheque │ KI Current A/c   │ 🖼      │ ✓  ✕   │
└───┴────────────────┴──────────────┴──────────┴────────┴──────────────────┴────────┴────────┘
                                                        [ VERIFY SELECTED (2) ]  ◀─ GOLD
```
- ✕ opens a reject sheet with a mandatory reason. The salesperson is notified.
- Proof opens a side panel with the image (zoom) and the UTR to match against the bank statement.
- Sub-tab **Cash with staff**: per person, the list of undeposited amounts → "Mark deposited" (account + date).

### 11.9 Orders list  — [GOLD] = "＋ New order" (desktop: page header button · mobile: sticky button above the nav; hidden for roles that cannot create orders, in which case [GOLD] = the "Export" button)

Desktop table: Number · Date · Customer · Salesperson · Items · Total · Balance · Status · Delivery due.
Filters: status (multi), salesperson, entity, date range, "has balance", "overdue", "stuck", product, customer type. Search by number, customer name or phone. Saved views: "My open orders", "Ready to dispatch", "Unpaid delivered". Export the current view to Excel.
Mobile: `OrderCard` list with the same filters in a sheet.

### 11.10 Dispatch board (Dispatch role, mobile + desktop)  — [GOLD] = action on the oldest overdue card ("Start" / "Mark ready" / "Dispatch")

```
 CONFIRMED (6)        IN PRODUCTION (9)      READY (4)            DISPATCHED (3)
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ KI/…/0415  ⏱12d  │ │ KFM/…/0390  ⏱9d  │ │ KI/…/0401        │ │ KI/…/0399        │
│ Swaada Foods     │ │ Fresh Pack       │ │ Ram Peddi        │ │ Mathews          │
│ 17 machines      │ │ 8 machines       │ │ Vada machine ×2  │ │ 50kg kneader     │
│ due 05 Oct (late)│ │ due 12 Oct       │ │ due 10 Oct       │ │ LR 88213 · ABT   │
│ [START] ◀─ GOLD  │ │ [MARK READY]     │ │ [DISPATCH]       │ │ [DELIVERED]      │
└──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘
```
- Dispatch role never sees prices or balances.
- "Dispatch" opens a sheet: pick lines + qty, transporter, LR no., vehicle, photos → Save → offer WhatsApp update.
- Mobile shows one column at a time with segmented tabs.

### 11.11 Customers
List: name, business, phone, city, type, orders, lifetime value, balance. Detail page: contact info, all orders, all payments, follow-up history, "New order for this customer" ([GOLD]). Merge tool (Admin): pick two customers → choose the surviving record → orders move over → audit log entry.

### 11.12 Price list (Catalogue)  — [GOLD] = "Save changes"
Spreadsheet-like editor grouped by category: Name · Spec · Dealer w/o motor · Dealer · Customer · GST · Stock item · Active. Inline edit with dirty-row highlighting. Bulk % change per category ("Increase customer price by 5%") with a preview. Price history drawer per product. Import/export as Excel. Sales see a read-only list with customer price only.

### 11.13 Settings
- **Users:** add user (name, mobile, role, default entity, can receive payments, language) → system creates the Supabase auth user with a temporary password shown once and copy/WhatsApp-able. Reset password. Deactivate.
- **Entities & accounts:** KI, KFM. Bank/UPI/cash accounts per entity.
- **Targets:** grid of salesperson × month.
- **General:** thresholds from `TenantSettings`.
- **WhatsApp:** credentials, template names, test-send button, webhook URL + verify token display.
- **Import:** §15 wizard.

### 11.14 Reports (export to Excel)
1. Sales register (orders with lines) for a period.
2. Collections register (payments with status, received into, verified by).
3. Outstanding by customer with aging.
4. Salesperson performance (booked, collected, target).
5. Cash with staff / deposit register.
6. Cancellations with reasons.
7. Product sales (qty, value).

Excel files: one header row, frozen panes, ₹ number format `[$₹-4009] #,##,##0`, dates `DD-MMM-YYYY`. Generated server-side with `exceljs`.

### 11.15 States every screen must handle
Loading (skeletons matching the final layout, no spinners on whole pages) · Empty (one sentence + one action) · Error (message + retry + reference id) · Offline (banner "You're offline — changes will be saved when you're back"; only the new-order draft works offline, submission is queued) · Permission denied (plain message, link home).

---

## 12. UX rules that make it "very easy"

1. **Phone number first.** It's the one thing every salesperson knows. It finds the customer, the history and the balance.
2. **Never ask for what we know.** Date = today, salesperson = me, entity = my default, price = list price, GST = product default.
3. **Three steps maximum** for any task. Show progress.
4. **Big, labelled buttons.** No icon-only actions on mobile except call/WhatsApp, which are universally understood.
5. **Forgiving input.** "29500", "29,500" and "29.5k" all parse to ₹29,500. Searching "10l tilt" finds "10L Tilting Wet Grinder" (aliases + trigram search via `pg_trgm`).
6. **Warnings, not walls.** Below-price orders are saved and routed for approval. Only truly invalid data blocks (no phone, qty 0, overpayment).
7. **Undo for 10 seconds** on non-financial actions (status change, note). Financial actions use confirmation sheets instead.
8. **Every number is a link** to the records behind it.
9. **Bilingual, one tap** (`EN | த`).
10. **Fast:** first load < 2.5 s on a mid-range Android over 4G. Navigations < 300 ms (prefetch + RSC streaming).

---

## 13. WhatsApp integration

| Template name | Trigger | Params | Example (en) |
|---|---|---|---|
| `order_confirmation` | Order confirmed (opt-in checkbox) | name, order no., items summary, total, advance, balance, delivery date, entity name | "Hi Gokul, thank you for your order KI/26-27/0412 with Kumaar Industries: 15kg Potato Peeler ×1. Total ₹24,000, advance ₹10,000, balance ₹14,000. Expected delivery 15 Oct." |
| `payment_received` | Payment **verified** | name, amount, receipt no., balance | "Received ₹14,000 (RCPT/26-27/01240). Balance now ₹0. Thank you!" |
| `dispatch_update` | Dispatch saved | name, order no., items, transporter, LR no. | "Your machines for KI/26-27/0412 have been dispatched via ABT, LR 88213." |
| `payment_reminder` | Manual tap / auto job | name, order no., balance, pay-to details | "Gentle reminder: ₹14,000 is pending for KI/26-27/0412. UPI: … Thank you." |

- Templates are created in Meta Business Manager in **English and Tamil**, and the customer's language is chosen per customer (default English).
- **Fallback:** if WhatsApp API settings are empty or the send fails, show "Open in WhatsApp" (a `https://wa.me/<phone>?text=<prefilled>` deep link) and log `status=DEEPLINK`.
- Webhook `/api/whatsapp/webhook`: `GET` verifies `hub.verify_token`. `POST` validates `X-Hub-Signature-256` against the app secret, then updates `WhatsAppMessage.status`. Always respond 200 within 5 s. Processing is idempotent on `waMessageId`.
- Rate: max 1 reminder per order per 48 h (manual or auto), enforced server-side.

---

## 14. Security, reliability & integrity

- **Auth:** Supabase Auth with phone + password. Admin creates users via the service-role key on the server only. Password min 8 chars. Login rate limit 5 attempts / 10 min per phone + IP.
- **Session → tenant:** `getSession()` resolves `authUserId → User → tenantId, role`. Every repository method requires `ctx: {tenantId, userId, role}`. An ESLint rule (`no-restricted-imports`) blocks importing `@prisma/client` outside `src/server/repo`.
- **RLS:** enabled on all tables with no client policies (direct browser access denied). Storage buckets are private. Files are served via signed URLs (5 min) after a permission check.
- **Idempotency:** every create/payment form sends an `idempotencyKey` (uuid). The server stores it for 24 h and returns the original result on retry. This prevents double orders on flaky networks.
- **Concurrency:** order edits use `updatedAt` optimistic locking. A conflict shows "This order was changed by {name} at {time}. Reload to see changes."
- **Transactions:** order create (counter + order + lines + advance payment + audit) runs in one `prisma.$transaction` with `Serializable` isolation for the counter row.
- **Backups:** Supabase daily backups + weekly logical dump to a separate bucket (pg_dump via cron). Restore drill documented in `docs/runbook.md`.
- **Secrets:** `.env` only. WhatsApp token encrypted at rest with `APP_ENCRYPTION_KEY`.
- **Privacy:** customer phones visible only to roles that can see the order. Dispatch sees the phone (needed for delivery) but not money.
- **Observability:** structured logs (pino) with `requestId`, `tenantId`, `userId`. Error tracking via Sentry. A `/api/health` endpoint checks DB connectivity.

---

## 15. Excel import (historical order book)

Purpose: load the existing `ORDER_DETAILS.xlsx` (and later files from other tenants) so outstanding balances and history exist on day one.

**Wizard (Settings → Import), 4 steps:**
1. **Upload** `.xlsx` (max 20 MB).
2. **Map sheets.** Each sheet → salesperson (dropdown of users) or "Price list" or "Skip". Pre-filled by matching sheet name to user name (e.g. sheet `VIJI` → user Viji). Per sheet, choose the date convention: `dd.mm.yy text` / `Excel dates are day-month swapped` (auto-detected, §15.1).
3. **Preview.** Table of normalized orders with issue badges. Counts: orders, total value, outstanding, issues by type. Download the issues as Excel.
4. **Commit.** Creates customers, orders (`source=IMPORT`, `importRef="SHEET!R<row>"`) and payments, all in batches of 200 with progress. Result report saved in `ImportBatch`.

**15.1 Parsing rules (derived from the real file):**
| Problem in file | Rule |
|---|---|
| Header row repeats per month block (`DATE`, `CUSTOMER DETAILS`, …) | Detect header rows by keyword match. Map columns by header text, not position (Mallika's sheet is offset by one column) |
| Month marker rows (a lone date) and TOTAL rows (`TOTAL`, lone number, `=SUM(…)`) | Treat as block boundaries. Never import as orders. Keep stated totals for reconciliation |
| Date formats `07.01.2026`, `13/01/26`, `03.01.26`, Excel serials, typos | Parse text dates as day-first. For Excel date cells, if the block's majority month disagrees with the cell's month but matches its day → swap day/month. If still invalid → use the block's month, day 1, and flag `DATE_GUESSED` |
| Multi-row orders (products on several rows, amount on last) | A row with no date, customer and phone continues the previous order. Its product text is appended as a line |
| Phone number in the customer column (Viji's sheet) | If the customer cell is a 10+ digit number, treat it as the phone and set name = "Unknown ({phone last 4})", flag `NO_NAME` |
| `NILL`, `NIL`, blank in ADV/BAL | = 0 |
| Formulas (`=23500*3`, `=F25-G25`) | Use cached values from the file (openpyxl/`xlsx` with `cellFormula:false`). If no cached value, evaluate simple arithmetic; else flag `FORMULA_UNRESOLVED` |
| Status text `DELIVERD`, `Delivered`, `PENDING`, `PARTIAL DELIVERY`, `Cancelled`, "cancel" anywhere in row | Map to `DELIVERED`, `CONFIRMED`, `PARTIALLY_DISPATCHED`, `CANCELLED` (reason `OTHER`, note = original text). No status + no balance → `CLOSED` |
| Payment route text (`KUMARESH GPAY`, `KFM CA`, `CASH`, `NAREN`) | Create one payment for the advance/paid amount. Map route keywords to Account or User via a mapping table configured in step 2. Imported payments are `VERIFIED` (historical) except where balance > 0 and status is PENDING |
| Products as free text | Imported as **custom lines** (description = original text). Optional fuzzy match to the catalogue (`pg_trgm` similarity ≥ 0.6) suggested in preview, never auto-applied |
| Same order on two sheets (e.g. Nallamuthu ₹1,70,000) | Flag `POSSIBLE_DUPLICATE` when phone (or name) + amount + month match across sheets. Default: import the first, skip the others. User can override |
| Separate product trackers (e.g. `TURBO ORDER`) | Default "Skip" with a note: "This sheet re-lists orders from other sheets" |

**Reconciliation evidence (required):** after preview, show per sheet per month: our computed total vs. the sheet's stated TOTAL row, with the difference. For the pilot file, the expected grand total is ≈ ₹7.05 Cr across ≈ 1,255 orders (after removing the known duplicates). Any month off by more than 2% must be explained in the import report before commit.

---

## 16. Testing strategy

| Layer | Tool | Must cover |
|---|---|---|
| Unit | Vitest | `money`, `phone`, `fy`, `numbering`, `order/totals`, `payment/balance`, `stateMachine` (every allowed + forbidden transition), overdue/stuck rules, import date parsing (with real problem rows from §15.1 as fixtures). **100% line coverage on `src/server/domain`.** |
| Integration | Vitest + test Postgres (Docker or Supabase branch) | Services: create order with advance (counter, balance, audit), concurrent order numbering (50 parallel creates → 50 unique sequential numbers), verify/reject payment recomputes balance & CLOSED, partial dispatch, cancel with refund, permission denials per role (matrix-driven test generated from §4.2) |
| E2E | Playwright (mobile viewport Pixel 7 + desktop 1440) | Login per role. Sales creates order for new and existing customer < 60 s. Below-floor → approval → approve. Record payment → verify → WhatsApp deep link. Dispatch partial → delivered → closed. Admin dashboard numbers equal seeded expectations. Tamil toggle. |
| Visual | Playwright screenshots | Every screen in §11 at 390×844 and 1440×900, light + dark (admin). Stored in `docs/evidence/screens/` |
| Accessibility | `@axe-core/playwright` + Lighthouse CI | 0 serious/critical axe violations. Lighthouse a11y ≥ 95, performance ≥ 85 mobile |

**Seed data (`prisma/seed.ts`):** tenant "KI-KFM Pilot", entities KI + KFM, 5 accounts, 1 owner, 1 admin, 1 accounts, 7 sales (the real first names), 1 dispatch, ~120 products from the real price list, 60 customers, 200 orders across the last 6 months with realistic statuses and payments (deterministic, seeded RNG), so the dashboard looks real in demos.

---

## 17. Build phases & verification gates

Each phase ends with a gate. **Paste the actual command output** (not a summary) into `docs/evidence/phase-N.md`, plus screenshots where listed. A phase without evidence is not done.

| Phase | Scope | Verification gate (evidence required) |
|---|---|---|
| **P0 Foundation** | Repo, Next.js + TS strict, Tailwind v4 tokens (§10.1), fonts, shadcn restyle, `next-intl` en/ta, Prisma schema (§7) + extra SQL, Supabase project, auth (login/logout, admin-created users), session→tenant, permissions map, role-aware shells (mobile bottom nav / desktop sidebar), `GoldAudit`, error/Toast system, CI (typecheck, lint, test, build) | `pnpm typecheck && pnpm lint && pnpm test && pnpm build` output. `prisma migrate status` output. Screenshots: login (en + ta), empty Sales home, empty Admin shell. Test proving a SALES user gets 403 on an admin Server Action |
| **P1 Masters** | Entities, accounts, users (create, reset, deactivate), targets, product categories + products + price history, price list editor + Excel import/export, customers (phone-first create, list, detail, merge) | Unit tests for `phone.ts`. Integration test: duplicate phone → same customer. Price list imported from the real sheet: paste the count of products created + 5 sample rows. Screenshots of 11.12, 11.13 |
| **P2 Orders** | 3-step wizard with draft autosave, product picker with alias/trigram search, custom lines, charges, numbering, approval flow, order list (filters, saved views, export), order detail, edit with optimistic lock, cancel request → approve, timeline/events, notifications | State machine unit tests (paste results). Concurrency test (50 parallel → unique numbers) output. E2E: create order < 60 s (paste the Playwright trace duration). Screenshots 11.2–11.4, 11.9 |
| **P3 Payments** | Record payment sheet, proof upload, verify queue (bulk), reject with reason, cash-with-staff + mark deposited, refunds, receipt numbers, balance recompute, CLOSED automation, Collect screen with aging, follow-ups, promised dates | Balance unit tests (paste). Integration: verify/reject/refund sequences produce exact balances (paste table of expected vs actual). Screenshots 11.5, 11.6, 11.8 |
| **P4 Dispatch** | Board, start/ready/dispatch (partial)/delivered, photos, stuck-order rule, Dispatch role price-hiding | E2E partial dispatch → delivered → closed (paste output). Test that the Dispatch role's responses contain no price fields (paste the JSON snapshot). Screenshot 11.10 |
| **P5 Dashboard & reports** | All §9 metrics with click-through, leaderboard, charts, 7 Excel reports | Integration test: seeded data → each metric equals a hand-computed expected value (paste the table). Open each exported xlsx and paste the header row + first 3 rows. Screenshot 11.7 (light + dark) |
| **P6 WhatsApp** | Settings, 4 templates, send service, deep-link fallback, webhook (GET/POST with signature check), reminder job + rate limit | Webhook verify `curl` output. Signature-reject test. Test-send screenshot from a real phone (or deep-link fallback screenshot). Rate-limit test output |
| **P7 Excel import** | §15 wizard + parser + reconciliation report | Run against the real `ORDER_DETAILS.xlsx`: paste the reconciliation table (per sheet per month: computed vs stated), totals, issue counts, duplicates detected (must include Nallamuthu ₹1,70,000) |
| **P8 Hardening & launch** | Idempotency, rate limits, audit log viewer, backups + restore drill, PWA (manifest, icons, offline draft), performance pass, axe/Lighthouse, Sentry, runbook, production deploy (Vercel + Supabase prod), UAT with 2 salespeople + owner | Lighthouse CI report (paste scores). axe report (0 serious). Restore drill log. UAT sign-off checklist (§18) with names and dates |

---

## 18. Acceptance criteria (UAT checklist)

- [ ] A salesperson logs in on their own Android phone, installs the app to the home screen, and switches to Tamil.
- [ ] They create an order for an **existing** customer by typing the phone number, with 1 machine and an advance, in ≤ 60 s.
- [ ] They create an order for a **new** customer with 3 machines + freight; the order number is correct for the chosen entity.
- [ ] A price below dealer price goes to approval. The owner approves on mobile, and the salesperson is notified.
- [ ] A cash payment "received into: Naren (personal)" shows in **Cash with staff** until marked deposited.
- [ ] Accounts verifies 5 payments in one action. A rejected payment re-opens the balance and notifies the salesperson.
- [ ] Dispatch delivers 10 of 17 machines (partial) and then the rest. The order becomes CLOSED once fully paid.
- [ ] A cancelled order with ₹20,000 verified advance shows a ₹20,000 refund due. Recording the refund settles it.
- [ ] The dashboard's Booked / Collected / Outstanding match the Excel reports for the same period exactly.
- [ ] A Sales user cannot open `/dashboard`, `/settings`, or another salesperson's order (UI and direct URL/Server Action both refuse).
- [ ] The historical import shows outstanding balances per customer that the owner confirms as correct (spot-check 10).
- [ ] The WhatsApp reminder reaches a real phone (or the deep link opens WhatsApp with the message prefilled).

---

## 19. Paste-ready prompts for Claude Code

> Use one prompt per session/phase. Each assumes this file exists at `docs/superpowers/specs/2026-10-10-salesos-design.md`.

### Prompt P0 — Foundation
```
Read docs/superpowers/specs/2026-10-10-salesos-design.md fully. It is the single source of truth.
Build Phase P0 (Foundation) exactly as specified in §3, §7, §8, §10, §11.0, §11.1, §14 and §17-P0.
- Next.js (latest stable, App Router) + TypeScript strict + pnpm. Tailwind v4 with the exact tokens in §10.1. Inter + Noto Sans Tamil via next/font.
- Restyle shadcn/ui primitives to the Sovereign tokens. Build components/app/{Money,StatusPill,Toast,EmptyState,ConfirmSheet} and the dev-only GoldAudit (§10.4).
- next-intl with en/ta. Every string in i18n files.
- Prisma schema exactly as §7, plus the extra SQL (checks + RLS enable). Seed script (tenant, entities, accounts, users per §16 seed list; products/orders come in later phases).
- Supabase Auth phone+password; admin-created users only; getSession() → tenant/role; permissions.ts implementing the §4.2 matrix; assertCan() used by every Server Action; ESLint rule blocking @prisma/client outside src/server/repo.
- Role-aware shells: mobile bottom nav (Sales, Dispatch), desktop sidebar (Owner/Admin/Accounts) per §11.0. Login screen per §11.1.
- Standard Server Action shape and AppError per §8. CI workflow running typecheck, lint, test, build.
Before writing code, show me: (1) the folder tree you will create, (2) the ASCII of the two shells, (3) the list of files. Wait for my OK.
After building, complete the §17-P0 verification gate and write all evidence (raw command output + screenshots via Playwright) to docs/evidence/phase-0.md. Do not claim done without that file.
```

### Prompt P1 — Masters
```
Read the spec (docs/superpowers/specs/2026-10-10-salesos-design.md). Phase P0 is complete (see docs/evidence/phase-0.md).
Build Phase P1 (Masters): §4.2 permissions for these screens, §6 BR-06/BR-07, §7 models (BillingEntity, Account, User, SalesTarget, ProductCategory, Product, ProductPriceHistory, Customer), §11.11, §11.12, §11.13, §12 rules 1, 2, 5.
- Phone normalisation in src/server/domain/phone.ts with 100% unit coverage.
- Product search: pg_trgm index on searchText + aliases; ProductPicker component (§10.5) built now as it is reused in P2.
- Price list Excel import/export using exceljs. Import the real price list sheet "PRICE LIST KI - KFM - 2026" format (columns: PRODUCT, HP, DEALER PRICE w/o MOTOR, DEALER PRICE, CUSTOMER PRICE; product name may be blank on continuation rows like 'COPP' variants: inherit the previous name).
- Customer merge tool with audit log.
Show the ASCII wireframes you will implement before coding. Then build, test, and complete the §17-P1 gate in docs/evidence/phase-1.md with raw outputs and screenshots.
```

### Prompt P2 — Orders
```
Read the spec. P0–P1 complete.
Build Phase P2 (Orders): §5.1, §5.6, §6 (BR-04, BR-08, BR-10, BR-11, BR-14), §7 Order/OrderLine/OrderCharge/OrderEvent/DocumentCounter/Notification, §11.2, §11.3, §11.4, §11.9, §12, §14 (idempotency, optimistic locking, transactions).
- src/server/domain/order/stateMachine.ts + totals.ts + numbering.ts + fy.ts: pure, 100% unit-tested, including every forbidden transition.
- New-order wizard exactly as the §11.3 wireframes, with IndexedDB draft autosave and the "continue draft" prompt. Forgiving amount parsing ("29.5k").
- Approval flow and notifications. Cancel request → admin approval.
- Integration test: 50 parallel order creates → 50 unique, gapless numbers for the same entity+FY.
- Playwright E2E: Sales creates an order for an existing customer; assert duration < 60s; save the trace.
Show the plan + ASCII before coding. Complete the §17-P2 gate in docs/evidence/phase-2.md.
```

### Prompt P3 — Payments
```
Read the spec. P0–P2 complete.
Build Phase P3 (Payments & Collect): §5.2, §5.4, §6 BR-05, BR-09, §7 Payment/FollowUp, §9 money definitions, §11.5, §11.6, §11.8.
- src/server/domain/payment/balance.ts: pure, 100% unit tested. balanceDue recomputed in the same transaction as every payment/order change. Auto CLOSED/re-open rules.
- Proof uploads to private Supabase Storage with signed URLs; image compression client-side (max 1600px, ~300KB).
- Verify queue with bulk verify, reject sheet with mandatory reason, Cash-with-staff tab with "mark deposited".
- Refund flow for cancelled orders.
- Integration test table: for 12 scripted sequences (advance, part, reject, refund, cancel…) assert expected vs actual balance and status; paste the table.
Complete the §17-P3 gate in docs/evidence/phase-3.md.
```

### Prompt P4 — Dispatch
```
Read the spec. P0–P3 complete.
Build Phase P4 (Dispatch): §5.3, §5.5, §7 Dispatch/DispatchLine, §11.10, §4.2 Dispatch-role restrictions.
- Partial dispatch by line + qty; order status derived from dispatched quantities.
- Dispatch role DTOs must not contain any money fields: create dedicated select shapes and a test that snapshots the JSON.
- Stuck-order rule as a pure function + used by the board badge and dashboard.
Complete the §17-P4 gate in docs/evidence/phase-4.md.
```

### Prompt P5 — Dashboard & Reports
```
Read the spec. P0–P4 complete.
Build Phase P5: §9 (every metric exactly as defined, each clickable to its filtered list), §11.7, §11.14, §10.6 count-up animation.
- dashboardService with one function per metric, each with an integration test against deterministic seed data comparing to hand-computed expected values (paste the table).
- Charts: simple, Sovereign-styled (no chart junk), accessible labels, tabular numbers. Gold only on the "Collected (verified)" hero figure.
- 7 Excel reports with exceljs, formats per §11.14.
Complete the §17-P5 gate in docs/evidence/phase-5.md (include light + dark screenshots).
```

### Prompt P6 — WhatsApp
```
Read the spec. P0–P5 complete.
Build Phase P6: §13 entirely, §7 WhatsAppMessage, Settings → WhatsApp screen, reminder cron job with the 48h rate limit, Sunday/time-window rules, wa.me fallback.
- Webhook: GET verify + POST with X-Hub-Signature-256 validation; idempotent on waMessageId; respond 200 fast.
- Token encrypted at rest (AES-256-GCM, APP_ENCRYPTION_KEY).
Complete the §17-P6 gate in docs/evidence/phase-6.md with curl outputs and tests.
```

### Prompt P7 — Excel import
```
Read the spec. P0–P6 complete.
Build Phase P7: §15 wizard + parser implementing every rule in §15.1 with unit tests using real problem rows as fixtures (swapped dates, phone-in-name, multi-row orders, NILL, formulas, TOTAL rows, offset columns, cancel text, duplicates across sheets).
Run it against the real ORDER_DETAILS.xlsx (I will place it at fixtures/ORDER_DETAILS.xlsx). In docs/evidence/phase-7.md paste: the per-sheet per-month reconciliation table (computed vs stated TOTAL), grand total and order count (expected ≈ ₹7.05 Cr / ≈ 1,255 orders), issue counts by type, and the duplicate list (must include Nallamuthu ₹1,70,000). Explain every month that differs by more than 2%.
```

### Prompt P8 — Hardening & launch
```
Read the spec. P0–P7 complete.
Build Phase P8: §14 in full (idempotency audit, rate limits, audit log viewer, backups + restore drill), PWA (manifest, icons, offline banner, queued draft submit), performance targets in §12.10, Sentry, docs/runbook.md, production deployment (Vercel + Supabase prod project, env checklist).
Run axe + Lighthouse CI on every §11 screen at mobile and desktop sizes. Fix until a11y ≥ 95, perf ≥ 85 (mobile), 0 serious axe issues.
Produce docs/evidence/phase-8.md with raw reports, the restore drill log, and the §18 UAT checklist ready for sign-off.
```

---

## 20. Backlog (after v1)

1. Quotation builder → PDF → WhatsApp, converting to an order in one tap.
2. Lead inbox (IndiaMART / JustDial / website / WhatsApp click-to-chat) with assignment and conversion tracking.
3. Dealer price tiers and dealer login (dealers place repeat orders themselves).
4. Service & AMC tickets (the order book already contains service entries: spares, oil seals, bearings).
5. GST tax invoice generation and Tally export.
6. Production job cards per machine (fabrication → motor fitting → testing → painting).
7. Multi-tenant self-onboarding + billing for other machinery sellers (the schema is already ready).

---

## 21. Open questions (resolve before or during P0)

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Are KI and KFM separate GST registrations needing separate order number series? | Yes. Separate series per entity (BR-04) |
| Q2 | Are prices in the price list GST-inclusive? | Yes (`pricesIncludeGst = true`) |
| Q3 | Who besides Owner may approve discounts? | Owner + Admin |
| Q4 | Who reviews the Tamil copy? | Client nominates one staff member |
| Q5 | Monthly targets per salesperson? | Admin enters in Settings → Targets; blank = no progress bar |
| Q6 | Should Dispatch see customer phone numbers? | Yes (needed for delivery), no money |
| Q7 | Hosting region | Supabase `ap-south-1` (Mumbai), Vercel `bom1` |
| Q8 | Import all of 2026 history or only open balances? | All 2026; closed orders imported as CLOSED |
