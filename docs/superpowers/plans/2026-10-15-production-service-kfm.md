# Production module, Service requests, Username login, Dashboards, KFM brand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `docs/superpowers/specs/2026-10-15-production-service-kfm-design.md`: username logins (SADMIN / names / PRODUCTION), a production workflow (On progress → Finished → Delivered), a richer new-order form, a Service-request module, follow-up + pie-chart dashboards, a full Excel export, the KFM brand, and a clean data reset.

**Architecture:** Next.js 16 App Router + Prisma 6 + PostgreSQL 16. Business rules live in pure modules under `src/server/domain/**` (unit-tested), DB work in `src/server/services/**` and `src/server/repo/**`, mutations via `makeServerAction` in route-local `actions*.ts`, UI as server pages + small client components. Role-specific navigation lives in `src/app/(app)/_shells/*Shell.tsx`, chosen in `src/app/(app)/layout.tsx`.

**Tech Stack:** Next.js 16.4 (read `node_modules/next/dist/docs/` before Next-specific code), React 19, Prisma 6.19, PostgreSQL 16, Tailwind 4 tokens in `src/app/globals.css`, Vitest, exceljs, lucide-react.

## Global Constraints
- Flat colours only — **no gradients, no purple** (client rule). Use CSS token vars, not hard-coded colours (except logo assets).
- Company name: **Kumar Food Machinery**; short name **KFM**; tagline **Engineering Food Excellence · Since 1999**.
- Logo green `#406E32`, charcoal `#2D2B2C` (from the client's vector PDF).
- Order statuses: `PENDING` / `DELIVERED` / `CANCELLED` (label "Pending" / "Delivered" / "Cancelled").
- Production statuses: `NOT_STARTED` / `IN_PROGRESS` / `FINISHED` (label "Not started" / "On progress" / "Finished").
- Delivered only when production = FINISHED; OWNER/ADMIN may override.
- PRODUCTION role never sees money (totals, paid, balances, payments, dashboards, price list, settings).
- Usernames stored lowercase, trimmed, unique per tenant; login accepts username **or** email.
- Payment modes in the form: UPI, Cash, Account (= `BANK_TRANSFER`), Cheque. "Account name" optional → `Order.accDetails` + advance payment note.
- Every task ends with: `pnpm exec tsc --noEmit -p .` = 0 errors, `pnpm exec eslint src` = 0 errors, `pnpm exec vitest run tests/unit` all pass.
- Local DB for manual checks: `postgresql://postgres:postgres@127.0.0.1:55433/import_v2` (dev server on :3000 runs against it).

## File map
| Area | Files |
|---|---|
| Schema | `prisma/schema.prisma`, `prisma/migrations/20261015100000_production_service_username/migration.sql` |
| Rules | `src/server/domain/v1_1/workflow.ts` (new), `src/server/domain/auth/username.ts` (new), `src/server/domain/dashboard/followUp.ts` (new), `src/server/domain/dashboard/pies.ts` (new) |
| Permissions | `src/server/auth/permissions.ts` |
| Login / users | `src/app/(auth)/login/actions.ts`, `src/app/(auth)/login/LoginForm.tsx`, `src/server/services/userService.ts`, `src/server/repo/users.ts`, `src/app/(app)/settings/users/**` |
| Orders | `src/server/services/orderV2Service.ts`, `src/app/(app)/orders/actions-v2.ts`, `src/server/repo/ordersV2.ts`, `src/app/(app)/orders/_components/sheet/*`, `src/app/(app)/orders/[id]/*`, `src/app/(app)/orders/export/route.ts`, `src/lib/orderDisplay.ts` |
| Production | `src/app/(app)/_shells/ProductionShell.tsx` (new), `src/app/(app)/production/page.tsx` + `actions.ts` + `ProductionBoard.tsx` + `export/route.ts` (new), `src/server/repo/production.ts` (new) |
| Service | `src/server/services/serviceRequestService.ts` (new), `src/app/(app)/service/page.tsx` + `actions.ts` + `_components/*` (new) |
| Dashboards | `src/components/app/charts/DonutChart.tsx` (new), `src/app/(app)/dashboard/_components/{FollowUpList,PipelineStrip,ServiceSummary,PieRow}.tsx` (new), `src/server/services/opsOverviewService.ts` (new), `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/home/page.tsx` |
| Brand | `src/config/brand.ts`, `src/components/app/Logo.tsx`, `public/brand/kfm-*.svg` (new), `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icons/*`, `src/app/globals.css`, login page |
| Reset / ops | `scripts/sql/fresh-start.sql` (new), `scripts/set-usernames.ts` (new) |

---

### Task 1: Schema — roles, statuses, production, usernames, service requests

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261015100000_production_service_username/migration.sql`
- Modify (rename `COMPLETED`→`DELIVERED` everywhere): all files from `grep -rln COMPLETED src tests`
- Modify: `src/server/auth/permissions.ts`

**Interfaces — Produces:** `Role.PRODUCTION`; `OrderStatusV2 = PENDING|DELIVERED|CANCELLED`; `ProductionStatus = NOT_STARTED|IN_PROGRESS|FINISHED`; `Order.productionStatus/productionUpdatedAt/productionUpdatedById`; `User.username String?` `@@unique([tenantId, username])`; `ServiceRequest` model; enums `ServiceType FREE|PAID`, `ServiceStatus PENDING|DONE`; permission actions `production.view`, `production.update`, `service.create`, `service.view`, `service.update`.

- [ ] **Step 1: Edit schema.** Add `PRODUCTION` to `enum Role`; rename `COMPLETED` → `DELIVERED` in `enum OrderStatusV2`; add:
```prisma
enum ProductionStatus {
  NOT_STARTED
  IN_PROGRESS
  FINISHED
}
enum ServiceType {
  FREE
  PAID
}
enum ServiceStatus {
  PENDING
  DONE
}
```
In `model Order` add:
```prisma
  productionStatus      ProductionStatus @default(NOT_STARTED)
  productionUpdatedAt   DateTime?
  productionUpdatedById String?
  @@index([tenantId, productionStatus])
```
In `model User` add `username String? // login name, lowercase` and `@@unique([tenantId, username])`.
Add model:
```prisma
model ServiceRequest {
  id           String        @id @default(cuid())
  tenantId     String
  number       String        // SR-0001
  customerName String
  phone        String
  address      String?
  product      String?
  complaint    String
  serviceType  ServiceType
  status       ServiceStatus @default(PENDING)
  notes        String?
  createdById  String
  doneAt       DateTime?
  doneById     String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  @@unique([tenantId, number])
  @@index([tenantId, status])
  @@index([tenantId, createdById])
}
```
- [ ] **Step 2: Write migration SQL** (Postgres 16 supports `RENAME VALUE`):
```sql
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PRODUCTION';
ALTER TYPE "OrderStatusV2" RENAME VALUE 'COMPLETED' TO 'DELIVERED';
CREATE TYPE "ProductionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'FINISHED');
CREATE TYPE "ServiceType" AS ENUM ('FREE', 'PAID');
CREATE TYPE "ServiceStatus" AS ENUM ('PENDING', 'DONE');
ALTER TABLE "Order" ADD COLUMN "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN "productionUpdatedAt" TIMESTAMP(3), ADD COLUMN "productionUpdatedById" TEXT;
-- Orders already delivered were obviously produced.
UPDATE "Order" SET "productionStatus" = 'FINISHED' WHERE "simpleStatus" = 'DELIVERED';
CREATE INDEX "Order_tenantId_productionStatus_idx" ON "Order"("tenantId", "productionStatus");
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");
CREATE TABLE "ServiceRequest" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "number" TEXT NOT NULL, "customerName" TEXT NOT NULL,
  "phone" TEXT NOT NULL, "address" TEXT, "product" TEXT, "complaint" TEXT NOT NULL,
  "serviceType" "ServiceType" NOT NULL, "status" "ServiceStatus" NOT NULL DEFAULT 'PENDING', "notes" TEXT,
  "createdById" TEXT NOT NULL, "doneAt" TIMESTAMP(3), "doneById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "ServiceRequest_tenantId_number_key" ON "ServiceRequest"("tenantId", "number");
CREATE INDEX "ServiceRequest_tenantId_status_idx" ON "ServiceRequest"("tenantId", "status");
CREATE INDEX "ServiceRequest_tenantId_createdById_idx" ON "ServiceRequest"("tenantId", "createdById");
ALTER TABLE "ServiceRequest" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ServiceRequest" FORCE ROW LEVEL SECURITY;
```
- [ ] **Step 3: Verify migration == schema**: `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://postgres:postgres@127.0.0.1:55433/shadow_check` → `No difference detected.` (`ALTER TYPE … ADD VALUE` must be in its own migration file if Prisma complains about using the new value in the same transaction — none of the SQL above uses `PRODUCTION`, so one file is fine.)
- [ ] **Step 4: Apply locally + regenerate**: `DATABASE_URL=… DIRECT_URL=… pnpm exec prisma migrate deploy && pnpm exec prisma generate`.
- [ ] **Step 5: Rename COMPLETED → DELIVERED in code** (`grep -rln COMPLETED src tests`), labels "Completed" → "Delivered" in order UIs (`sheetFormat.ts`, `OrderSheet.tsx`, `OrderCard.tsx`, `[id]/page.tsx`, dashboards, home), filter value `completed` → keep URL key `completed` but label "Delivered". `legacyStatus` mapping keeps `DELIVERED`.
- [ ] **Step 6: Permissions** — add to `ACTIONS` and matrix (OWNER/ADMIN full everywhere unless noted):
```ts
"production.view":   { OWNER: "full", ADMIN: "full", ACCOUNTS: "readOnly", SALES: "own",    DISPATCH: "denied", PRODUCTION: "full" },
"production.update": { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied",   SALES: "denied", DISPATCH: "denied", PRODUCTION: "full" },
"service.create":    { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied",   SALES: "full",   DISPATCH: "denied", PRODUCTION: "denied" },
"service.view":      { OWNER: "full", ADMIN: "full", ACCOUNTS: "readOnly", SALES: "own",    DISPATCH: "denied", PRODUCTION: "full" },
"service.update":    { OWNER: "full", ADMIN: "full", ACCOUNTS: "denied",   SALES: "denied", DISPATCH: "denied", PRODUCTION: "full" },
```
and give `PRODUCTION` a value in every existing row (`"denied"` except `profile.self: "full"`). Update `tests/unit/permissions.test.ts` expectations for the new role.
- [ ] **Step 7: Checks + commit** — tsc/eslint/vitest green; `git commit -m "feat(schema): production status, delivered, usernames, service requests"`.

### Task 2: Pure rules — workflow + usernames

**Files:** Create `src/server/domain/v1_1/workflow.ts`, `src/server/domain/auth/username.ts`; Test `tests/unit/workflow.test.ts`, `tests/unit/username.test.ts`.

**Produces:**
```ts
// workflow.ts
export type ProductionStatus = "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
export type OrderStatus = "PENDING" | "DELIVERED" | "CANCELLED";
export type ActorRole = "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "DISPATCH" | "PRODUCTION";
export const PRODUCTION_LABEL: Record<ProductionStatus, string>; // Not started / On progress / Finished
export const ORDER_STATUS_LABEL: Record<OrderStatus, string>;    // Pending / Delivered / Cancelled
export function deliveredBlockReason(p: { productionStatus: ProductionStatus; role: ActorRole }): string | null;
export function canUpdateProduction(role: ActorRole): boolean;
export function productionEditable(order: { simpleStatus: OrderStatus }): boolean; // false for DELIVERED/CANCELLED
// username.ts
export function normalizeUsername(raw: string): string;           // trim, lowercase, collapse spaces
export function usernameError(raw: string): string | null;        // 2–40 chars, letters/digits/space . _ -
export function looksLikeEmail(raw: string): boolean;
```
- [ ] **Step 1: Failing tests**
```ts
import { describe, it, expect } from "vitest";
import { deliveredBlockReason, canUpdateProduction, productionEditable, PRODUCTION_LABEL } from "@/server/domain/v1_1/workflow";
describe("workflow", () => {
  it("sales can mark Delivered only after production Finished", () => {
    expect(deliveredBlockReason({ productionStatus: "IN_PROGRESS", role: "SALES" })).toMatch(/production/i);
    expect(deliveredBlockReason({ productionStatus: "FINISHED", role: "SALES" })).toBeNull();
  });
  it("owner/admin may override", () => {
    expect(deliveredBlockReason({ productionStatus: "NOT_STARTED", role: "ADMIN" })).toBeNull();
    expect(deliveredBlockReason({ productionStatus: "NOT_STARTED", role: "OWNER" })).toBeNull();
  });
  it("only production/owner/admin update production; not after delivery/cancel", () => {
    expect(canUpdateProduction("PRODUCTION")).toBe(true);
    expect(canUpdateProduction("SALES")).toBe(false);
    expect(productionEditable({ simpleStatus: "DELIVERED" })).toBe(false);
    expect(productionEditable({ simpleStatus: "PENDING" })).toBe(true);
    expect(PRODUCTION_LABEL.IN_PROGRESS).toBe("On progress");
  });
});
```
```ts
import { describe, it, expect } from "vitest";
import { normalizeUsername, usernameError, looksLikeEmail } from "@/server/domain/auth/username";
describe("username", () => {
  it("normalises", () => { expect(normalizeUsername("  Naren  ")).toBe("naren"); expect(normalizeUsername("SADMIN")).toBe("sadmin"); expect(normalizeUsername("Viji  K")).toBe("viji k"); });
  it("validates", () => { expect(usernameError("n")).toMatch(/2/); expect(usernameError("naren")).toBeNull(); expect(usernameError("na<me")).toMatch(/letters/); });
  it("detects emails", () => { expect(looksLikeEmail("a@b.com")).toBe(true); expect(looksLikeEmail("naren")).toBe(false); });
});
```
- [ ] **Step 2: Run** `pnpm exec vitest run tests/unit/workflow.test.ts tests/unit/username.test.ts` → FAIL (modules missing).
- [ ] **Step 3: Implement**
```ts
// src/server/domain/v1_1/workflow.ts
export type ProductionStatus = "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";
export type OrderStatus = "PENDING" | "DELIVERED" | "CANCELLED";
export type ActorRole = "OWNER" | "ADMIN" | "ACCOUNTS" | "SALES" | "DISPATCH" | "PRODUCTION";
export const PRODUCTION_LABEL: Record<ProductionStatus, string> = { NOT_STARTED: "Not started", IN_PROGRESS: "On progress", FINISHED: "Finished" };
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { PENDING: "Pending", DELIVERED: "Delivered", CANCELLED: "Cancelled" };
const isAdmin = (r: ActorRole) => r === "OWNER" || r === "ADMIN";
/** Why this actor may not mark the order Delivered yet (null = allowed). */
export function deliveredBlockReason(p: { productionStatus: ProductionStatus; role: ActorRole }): string | null {
  if (isAdmin(p.role) || p.productionStatus === "FINISHED") return null;
  return "Production hasn't finished this order yet — it can be marked Delivered once production marks it Finished.";
}
export const canUpdateProduction = (role: ActorRole) => role === "PRODUCTION" || isAdmin(role);
export const productionEditable = (o: { simpleStatus: OrderStatus }) => o.simpleStatus === "PENDING";
```
```ts
// src/server/domain/auth/username.ts
export const normalizeUsername = (raw: string) => raw.trim().replace(/\s+/g, " ").toLowerCase();
export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 2 || u.length > 40) return "Username must be 2–40 characters.";
  if (!/^[a-z0-9 ._-]+$/.test(u)) return "Use letters, numbers, spaces, dot, dash or underscore only.";
  return null;
}
export const looksLikeEmail = (raw: string) => /\S+@\S+\.\S+/.test(raw.trim());
```
- [ ] **Step 4: Run tests** → PASS. **Step 5: Commit** `feat(domain): workflow + username rules`.

### Task 3: Username login + user management

**Files:** `src/app/(auth)/login/actions.ts`, `src/app/(auth)/login/LoginForm.tsx`, `src/server/services/userService.ts` (`adminCreateUser`, `adminUpdateUser`, `getUserForEdit`), `src/server/repo/users.ts` (`UserListRow.username`), `src/app/(app)/settings/users/actions.ts` (Create/Edit inputs gain `username`), `settings/users/new/CreateUserForm.tsx`, `settings/users/[id]/EditUserForm.tsx`, `settings/users/page.tsx` (show username column), `src/app/(app)/profile/page.tsx` (show username read-only). Test `tests/unit/login-identity.test.ts` for `resolveLoginWhere`.

**Consumes:** `normalizeUsername`, `usernameError`, `looksLikeEmail` (Task 2).
**Produces:** `export function resolveLoginWhere(identity: string): { email: string } | { username: string }` in `src/server/auth/loginIdentity.ts`.

- [ ] **Step 1: Test**
```ts
import { describe, it, expect } from "vitest";
import { resolveLoginWhere } from "@/server/auth/loginIdentity";
describe("login identity", () => {
  it("username by default, email when it looks like one", () => {
    expect(resolveLoginWhere(" SADMIN ")).toEqual({ username: "sadmin" });
    expect(resolveLoginWhere("Naren")).toEqual({ username: "naren" });
    expect(resolveLoginWhere("Kumar@Gmail.com")).toEqual({ email: "kumar@gmail.com" });
  });
});
```
- [ ] **Step 2: Implement** `src/server/auth/loginIdentity.ts`:
```ts
import { looksLikeEmail, normalizeUsername } from "@/server/domain/auth/username";
export function resolveLoginWhere(identity: string): { email: string } | { username: string } {
  return looksLikeEmail(identity) ? { email: identity.trim().toLowerCase() } : { username: normalizeUsername(identity) };
}
```
In `login/actions.ts`: input field `email` → `identity` (keep accepting `email` key for compat: `z.object({ identity: z.string().trim().min(2).max(254).optional(), email: … optional, password })`, use `identity ?? email`); `prisma.user.findFirst({ where: resolveLoginWhere(identity), … })`; error text "Username or password is wrong.". Rate-limit key = normalized identity.
`LoginForm.tsx`: field label **Username**, `autoComplete="username"`, `type="text"`, placeholder `e.g. naren`, icon `UserRound`, send `{ identity, password }`.
- [ ] **Step 3: Users** — `adminCreateUser`/`adminUpdateUser` accept `username?: string`; validate with `usernameError`, store `normalizeUsername`, unique check `prisma.user.findFirst({ where: { tenantId, username, id: { not } } })` → `AppError("CONFLICT", "That username is taken.")`. Email becomes optional on create (keep column). Forms: Username field first ("They sign in with this"), Email field optional. Users list shows `@username` under the name. Role select includes `PRODUCTION` (label "Production").
- [ ] **Step 4: Run** unit tests + tsc. Manual: set a username for the local test owner via edit page; log out; log in with it.
- [ ] **Step 5: Commit** `feat(auth): sign in with username`.

### Task 4: Order workflow services + actions

**Files:** `src/server/services/orderV2Service.ts`, `src/app/(app)/orders/actions-v2.ts`, `src/server/repo/ordersV2.ts` (rows + detail include `productionStatus`, `productionUpdatedAt`, `promisedDeliveryDate`), integration test `tests/integration/order-v2-rules.test.ts` (extend if DB harness available).

**Consumes:** `deliveredBlockReason`, `canUpdateProduction`, `productionEditable`.
**Produces:**
```ts
export async function setProductionStatusV2(input: { tenantId: string; actorId: string; actorRole: ActorRole; orderId: string; status: ProductionStatus }): Promise<Order>;
// setOrderStatusV2 gains actorRole and enforces deliveredBlockReason when status === "DELIVERED"
export const setProductionStatusAction; // input { orderId, status }, action "production.update"
```
- [ ] **Step 1:** In `setOrderStatusV2` add `actorRole: ActorRole` param; select `productionStatus`; when `input.status === "DELIVERED"`: `const why = deliveredBlockReason({ productionStatus: current.productionStatus, role: input.actorRole }); if (why) throw new AppError("VALIDATION", why);` When an admin overrides, also set `productionStatus: "FINISHED"`. Update the action to pass `session.role`, enum `["PENDING","DELIVERED","CANCELLED"]`.
- [ ] **Step 2:** Add `setProductionStatusV2` (load order; `canUpdateProduction` else FORBIDDEN; `productionEditable` else VALIDATION "This order is already delivered/cancelled."; update `productionStatus`, `productionUpdatedAt: new Date()`, `productionUpdatedById`; `writeAudit(… action: "ORDER_PRODUCTION_STATUS" …)`).
- [ ] **Step 3:** Action `setProductionStatusAction` in a new `src/app/(app)/production/actions.ts` (`action: "production.update"`, revalidate `["/production", "/orders", "/dashboard", "/home"]`).
- [ ] **Step 4:** Extend `OrderV2Row` with `productionStatus: ProductionStatus` and select it in `listOrdersV2`/`getOrderV2WithPayments`.
- [ ] **Step 5:** tsc/vitest; commit `feat(orders): production status + delivered gate`.

### Task 5: New order form — dates, comments, received, mode, account name

**Files:** `src/server/services/orderV2Service.ts` (`CreateOrderV2Input` + `createOrderV2` + `insertOrderV2Tx` already accepts `promisedDeliveryDate`, `accDetails`, `paymentNote`), `src/app/(app)/orders/actions-v2.ts` (`CreateInput`), `src/app/(app)/orders/_components/sheet/useOrderForms.ts`, `NewOrderSheet.tsx`.

- [ ] **Step 1:** `CreateInput` adds `orderDate: z.string().regex(ymd).optional()`, `deliveryDate: z.string().regex(ymd).nullable().optional()`, `accDetails: z.string().max(200).nullable().optional()`; `note` stays (Comments). Map: `orderDate → new Date(\`${d}T00:00:00.000Z\`)` (reject future > today+0? allow past only: `d <= istToday()`), `deliveryDate` must be ≥ orderDate.
- [ ] **Step 2:** `createOrderV2` passes `promisedDeliveryDate`, `accDetails`, `paymentNote: accDetails` to `insertOrderV2Tx`.
- [ ] **Step 3:** Form (keep current step layout): add **Order date** (`<Input type="date">`, default today IST), **Delivery date** (`type="date"`, min = order date), payment-mode radios **UPI · Cash · Account · Cheque** (Account = `BANK_TRANSFER`), **Account name (optional)** text input shown always under the mode, **Comments** textarea. Field label "Amount received ₹" (was "Amount").
- [ ] **Step 4:** Manual: create an order on local, open its page — delivery date, comments, "Payment received in" show. Commit `feat(orders): richer new-order form`.

### Task 6: Orders UI — both statuses everywhere + full Excel export

**Files:** `sheetFormat.ts` (`PRODUCTION_PILL` styles), `OrderSheet.tsx`, `OrderCard.tsx`, `orders/[id]/page.tsx`, `src/app/(app)/orders/export/route.ts`.
- [ ] **Step 1:** Add a **Production** column/pill (Not started grey, On progress amber `--color-warn-fill`-tinted, Finished green) beside Status in table, cards and the order page. Status dropdown option "Completed" → "Delivered"; when production ≠ FINISHED and role is SALES, the Delivered option is disabled with title "Waiting for production to finish".
- [ ] **Step 2:** Export columns (in this order): S.No, Order date, Delivery date, Employee, Customer, Contact, Products, Total, Received, Balance, Payment mode, Account name, Production, Status, Comments. Payment mode = method of the first non-rejected payment (or "—"). Button label "Export to Excel".
- [ ] **Step 3:** Manual: download, open, check columns. Commit `feat(orders): production column + full Excel export`.

### Task 7: Production module (PRODUCTION login)

**Files:** Create `src/app/(app)/_shells/ProductionShell.tsx` (nav: Production `/production`, Service `/service`), modify `src/app/(app)/layout.tsx` (`case "PRODUCTION"`), create `src/server/repo/production.ts`, `src/app/(app)/production/page.tsx`, `ProductionBoard.tsx` (client), `export/route.ts`. Guard money pages: `/dashboard`, `/orders`, `/catalogue`, `/settings`, `/employees`, `/home` redirect PRODUCTION to `/production` (add to each page's role checks; `/home` → `redirect("/production")`). Root `/` redirect sends PRODUCTION to `/production`.

**Produces:**
```ts
export type ProductionRow = { id: string; serialNo: number | null; orderDate: Date; deliveryDate: Date | null; customer: string; contact: string;
  productText: string | null; salesperson: string; notes: string | null; productionStatus: ProductionStatus; simpleStatus: OrderStatusV2 };
export async function listProductionOrders(opts: { tenantId: string; tab: "todo" | "progress" | "finished" | "delivered"; q?: string }): Promise<ProductionRow[]>;
```
(Select **no** money fields. Sort: deliveryDate asc nulls last, then orderDate asc. `todo` = PENDING & NOT_STARTED, `progress` = PENDING & IN_PROGRESS, `finished` = PENDING & FINISHED, `delivered` = DELIVERED in last 30 days.)
- [ ] **Step 1:** repo + page with tabs (counts), search, rows as cards on mobile / table on desktop, delivery badges (Overdue / Today / in N days), buttons **Start (On progress)** and **Finished** calling `setProductionStatusAction`, undo (back to previous) allowed while PENDING.
- [ ] **Step 2:** Export (no money): S.No, Order date, Delivery date, Customer, Contact, Products, Salesperson, Comments, Production status.
- [ ] **Step 3:** Manual with a PRODUCTION user. Commit `feat(production): production board`.

### Task 8: Service requests

**Files:** Create `src/server/services/serviceRequestService.ts`, `src/app/(app)/service/page.tsx`, `actions.ts`, `_components/NewServiceForm.tsx`, `_components/ServiceList.tsx`; add "Service" to Sales, Admin and Production shells; test `tests/unit/service-request.test.ts` for `validateServiceInput`.

**Produces:**
```ts
export type ServiceInput = { customerName: string; phone: string; address?: string | null; product?: string | null; complaint: string; serviceType: "FREE" | "PAID"; notes?: string | null };
export function validateServiceInput(i: ServiceInput): string | null;
export async function createServiceRequest(ctx: { tenantId: string; actorId: string }, i: ServiceInput): Promise<ServiceRequest>; // number SR-#### via allocateCounter key "SR"
export async function setServiceStatus(ctx: { tenantId: string; actorId: string; actorRole: ActorRole }, id: string, status: "PENDING" | "DONE"): Promise<ServiceRequest>;
export async function listServiceRequests(opts: { tenantId: string; createdById?: string; status?: "PENDING" | "DONE" }): Promise<(ServiceRequest & { createdByName: string })[]>;
```
- [ ] **Step 1: Test** `validateServiceInput`: missing name → "Enter the customer's name."; phone not 10 digits → "Enter a 10-digit mobile number."; empty complaint → "Describe the complaint."; valid → null.
- [ ] **Step 2: Implement** (phone normalised with `normalizePhone`, stored E.164; `setServiceStatus` requires `service.update`, sets `doneAt/doneById` when DONE; audit `SERVICE_CREATE` / `SERVICE_STATUS`).
- [ ] **Step 3: Page** — Sales: "New service request" form + "My requests" list with status pills; Production/Admin: all requests, filters Pending/Done, one-tap **Mark done** / **Reopen**; Admin also sees who created. Free/Paid pill.
- [ ] **Step 4:** Commit `feat(service): service request module`.

### Task 9: Dashboards — follow-up list, pie charts, pipeline, service summary

**Files:** Create `src/server/domain/dashboard/followUp.ts`, `src/server/domain/dashboard/pies.ts`, `src/components/app/charts/DonutChart.tsx`, `src/server/services/opsOverviewService.ts`, dashboard components `FollowUpList.tsx`, `PipelineStrip.tsx`, `ServiceSummary.tsx`, `PieRow.tsx`; modify `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/home/page.tsx`. Tests `tests/unit/follow-up.test.ts`, `tests/unit/pies.test.ts`.

**Produces:**
```ts
// followUp.ts
export type FollowUpItem = { id: string; deliveryDate: string | null; customer: string; productText: string | null; salesperson: string; productionStatus: ProductionStatus };
export type FollowUpGroups = { overdue: FollowUpItem[]; today: FollowUpItem[]; week: FollowUpItem[]; later: FollowUpItem[]; noDate: FollowUpItem[] };
export function groupFollowUps(items: FollowUpItem[], todayYmd: string): FollowUpGroups; // sorted by date asc inside each group
// pies.ts
export type Slice = { key: string; label: string; value: number; color: string };
export function statusSlices(c: { pending: number; inProgress: number; finished: number; delivered: number; cancelled: number }): Slice[]; // drops zero slices
export function slicesWithPercent(s: Slice[]): (Slice & { pct: number })[]; // pct rounded, sums to 100
// opsOverviewService.ts
export async function opsOverview(opts: { tenantId: string; salespersonId?: string; todayYmd: string }): Promise<{
  followUps: FollowUpGroups; status: Parameters<typeof statusSlices>[0];
  paymentModes: { mode: string; amount: string }[]; salesByEmployee: { name: string; value: string }[];
  pipeline: { notStarted: number; inProgress: number; finishedAwaitingDelivery: number; deliveredThisMonth: number };
  service: { pending: number; doneThisMonth: number; free: number; paid: number } }>;
```
- [ ] **Step 1: Tests**
```ts
import { groupFollowUps } from "@/server/domain/dashboard/followUp";
const it_ = (id: string, d: string | null) => ({ id, deliveryDate: d, customer: id, productText: null, salesperson: "N", productionStatus: "NOT_STARTED" as const });
expect(groupFollowUps([it_("a","2026-10-10"), it_("b","2026-10-15"), it_("c","2026-10-20"), it_("d","2026-11-30"), it_("e", null)], "2026-10-15"))
  .toMatchObject({ overdue: [{ id: "a" }], today: [{ id: "b" }], week: [{ id: "c" }], later: [{ id: "d" }], noDate: [{ id: "e" }] });
```
```ts
import { statusSlices, slicesWithPercent } from "@/server/domain/dashboard/pies";
const s = statusSlices({ pending: 2, inProgress: 1, finished: 0, delivered: 1, cancelled: 0 });
expect(s.map((x) => x.key)).toEqual(["pending", "inProgress", "delivered"]);
expect(slicesWithPercent(s).reduce((a, x) => a + x.pct, 0)).toBe(100);
```
- [ ] **Step 2: Implement** pure modules (week = 1–7 days ahead; percentages by largest-remainder). Colours from tokens: pending `var(--color-warn-fill)`, inProgress `#E0A526`, finished `var(--color-accent)`, delivered `#2D2B2C`, cancelled `var(--color-border-strong)`.
- [ ] **Step 3: `DonutChart`** — server-safe SVG (`<circle>` strokes with `stroke-dasharray`, no gradients), centre total, legend with value + %. Props `{ title: string; slices: Slice[]; formatValue?: (n: number) => string }`.
- [ ] **Step 4: Service** `opsOverview` (one query for not-delivered orders with delivery dates, groupBy for status/production counts, payments grouped by method for the current month, service counts). Employee scope via `salespersonId`.
- [ ] **Step 5: Admin dashboard** — after the KPI tiles: `PipelineStrip` (4 tiles linking to `/production` tabs), a 3-up `PieRow` (Order status · Payment modes · Sales by employee), `FollowUpList` (Overdue/Today/Next 7 days/Later; each row: delivery date, customer, products, salesperson, production pill, link), `ServiceSummary`. **Employee home** — `FollowUpList` (own), 2 donuts (own status + payment modes).
- [ ] **Step 6:** Commit `feat(dashboard): follow-ups, pie charts, pipeline, service summary`.

### Task 10: KFM brand

**Files:** `public/brand/kfm-lockup.svg`, `public/brand/kfm-emblem.svg` (from `pdftocairo -svg "KFM Logo Final File.pdf"`, background rect removed, cropped `viewBox`), `src/config/brand.ts`, `src/components/app/Logo.tsx`, `src/app/icon.svg`, `src/app/apple-icon.png`, `public/icons/*`, `src/app/manifest.ts`, `src/app/globals.css` (accent `#406E32`, hover `#355C29`, hero/sidebar `#2F4F26`-family forest tuned to logo, charcoal ink `#2D2B2C`), login page brand block, `public/offline.html`, `public/sw.js` VERSION bump.
- [ ] **Step 1:** Convert + crop: emblem = KFM mark only; lockup = mark + divider + "KUMAR FOOD MACHINERY / SINCE 1999" + tagline. Verify by rendering PNGs with sharp and viewing.
- [ ] **Step 2:** `BRAND = { name: "Kumar Food Machinery", shortName: "KFM", tagline: "Engineering Food Excellence", since: "Since 1999", product: "Orders · Production · Service" }`. `Logo`/`LogoMark` render `<img src="/brand/kfm-emblem.svg">` (tile = white badge on dark), `Wordmark` = "KUMAR / FOOD MACHINERY" with logo colours (light ink on dark).
- [ ] **Step 3:** Icons from the emblem on white (favicon, apple, 192/512, maskable). Manifest name/short name. Theme tokens tuned. Commit `feat(brand): KFM logo and colours`.

### Task 11: Fresh start + logins (production ops, after deploy)

**Files:** Create `scripts/sql/fresh-start.sql`, `scripts/set-usernames.ts`.
- [ ] **Step 1:** `fresh-start.sql` (one transaction): delete `DispatchLine`, `Dispatch`, `WhatsAppMessage` (orderId not null), `FollowUp`, `OrderEvent`, `OrderCharge`, `OrderLine`, `Payment`, `Notification` rows referencing orders, `AuditLog` where entity in ('Order','Payment','Customer'), `Order`, `Customer`, `ImportBatch`, `ServiceRequest`; `DocumentCounter` keys `ORDER:%`, `RCPT:%`, `SNO:%`, `SR`. Keep `User`, `Session`, `BillingEntity`, `Product*`, `Account`, `SalesTarget`, `Tenant*`. Print remaining counts.
- [ ] **Step 2:** `set-usernames.ts`: for each user without a username — OWNER → `sadmin`; others → `normalizeUsername(first name)` (append digit if taken); create PRODUCTION user `production` (name "Production", phone placeholder, password from env `PRODUCTION_PASSWORD`) if none. Print the username list (never passwords).
- [ ] **Step 3 (prod, after deploy):** expose DB → `pg_dump` backup → run `fresh-start.sql` → run `set-usernames.ts` → verify counts → close DB → log in as `sadmin`, an employee, and `production`.

---

## Self-review
- Spec §1 → T3, T11 · §2 → T1, T2, T4, T6 · §3 → T5 · §4 → T7 · §5 → T8 · §6 → T9 · §7 → T6, T7 · §8 → T11 · §9 → T10. No gaps.
- Names consistent: `ProductionStatus`, `setProductionStatusV2`, `setProductionStatusAction`, `deliveredBlockReason`, `normalizeUsername`, `resolveLoginWhere`, `groupFollowUps`, `statusSlices`, `opsOverview`.
