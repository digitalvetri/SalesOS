# Production module, service requests, username login, dashboards, KFM brand — design

Date: 2026-10-15 · Approved by the client in chat.

## Decisions (from the client)
- Fresh start: delete orders, customers, payments and their history. Keep employee logins and the Price List.
- Sales can mark an order **Delivered** only after production marks it **Finished** (Owner/Admin may override).
- Company name in the app: **Kumar Food Machinery** (new KFM logo).
- Service requests: always typed by hand (name, phone, address, complaint, free/paid) — no link to old orders.

## 1. Logins
- New `User.username` (unique per tenant, case-insensitive; stored lowercase). Login form asks **Username** (+ password).
  Login also still accepts an email for backwards compatibility.
- Employees: username = their name (e.g. `naren`). Admin (Owner): `sadmin`. New role **PRODUCTION**, one login `production`.
- Settings → Users → Edit: change username (unique check). New user form asks username.

## 2. Order process
- `OrderStatusV2`: PENDING · **DELIVERED** (renamed from COMPLETED; label "Delivered") · CANCELLED.
- New `Order.productionStatus` enum `ProductionStatus`: NOT_STARTED · IN_PROGRESS · FINISHED (+ `productionUpdatedAt`, `productionUpdatedById`).
- Rules (server-enforced):
  - PRODUCTION role may only change productionStatus (any order), never money/status.
  - Sales/Admin set Delivered only when productionStatus = FINISHED; Owner/Admin may override with a confirm.
  - Cancelled orders drop out of production lists.
- Every order list/card/detail shows both statuses.

## 3. New order form (sales)
Fields: order date (defaults to today, editable), **delivery date**, customer name, phone, products, total,
**amount received**, **payment mode** (UPI / Cash / Account(=BANK_TRANSFER) / Cheque kept), **account name** (optional → `Order.accDetails`
and the advance payment's note), **comments** (`Order.notes`).

## 4. Production module (role PRODUCTION)
- Nav: Production (orders board), Service requests, Profile.
- Orders board: all non-cancelled, not-delivered orders from all salespeople; columns: delivery date (with overdue/today
  badges), order date, client, phone, products, salesperson, comments, production status with one-tap
  On progress / Finished buttons. Tabs: To do · On progress · Finished (awaiting delivery) · Delivered (read-only, recent).
  Sorted by delivery date (overdue first, blank dates last). **No money anywhere.**
- PRODUCTION can't see /orders money pages, dashboards, price list, settings.

## 5. Service requests
- Model `ServiceRequest`: tenant, number (SR-0001), customerName, phone, address, complaint, product (optional text),
  serviceType FREE|PAID, status PENDING|DONE, createdById (salesperson), doneAt, doneById, notes, timestamps.
- Sales and Admin create. Sales see the requests they entered (like their orders); Admin and Production see all. Production toggles Pending/Done (Admin may too).
- Page `/service` for all three roles (actions differ by role).

## 6. Dashboards
- **Delivery follow-up** (admin overview + employee home + production board header): orders not delivered/cancelled with a
  delivery date, grouped Overdue · Today · Next 7 days · Later/No date, each showing production status. Employee sees own.
- **Pie charts** (SVG donut, no library, no gradients): order status split (Pending/On progress/Finished/Delivered/Cancelled),
  payment mode split (received amounts), admin also sales by employee. Employee home: own status + payment mode.
- Admin overview adds: production pipeline counts (Not started / On progress / Finished awaiting delivery / Delivered this
  month) and service requests summary (pending, done this month, free vs paid).

## 7. Export to Excel
Orders page "Export to Excel" (exists) gains: order date, delivery date, payment mode, account name, production status,
order status (Delivered naming), comments. Follows current filters. Production gets its own export (no money).

## 8. Fresh start (production DB)
Backup (pg_dump) → delete orders + lines/charges/events/payments/dispatches/follow-ups/WhatsApp messages/audit for orders,
customers, counters (ORDER/RCPT/SNO) → keep users, entities, products, settings. Set usernames; create PRODUCTION login.

## 9. Brand
Name "Kumar Food Machinery" (short "KFM"), tagline "Engineering Food Excellence · Since 1999". Logo from the client's vector
PDF (pdftocairo → SVG): full lockup on login, emblem + wordmark in sidebar, emblem for favicon/app icons. Theme green tuned
to logo green #406E32 (+ charcoal #2D2B2C); flat colours, no gradients/purple.

## Testing
Unit tests for status rules (delivered gate, production-only edits), username normalisation, follow-up grouping, pie data.
Integration test for production status + delivered gate where the DB harness exists. Manual browser check per role.
