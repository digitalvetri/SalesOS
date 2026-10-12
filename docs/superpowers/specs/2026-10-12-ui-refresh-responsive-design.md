# SalesOS — UI Refresh & Responsive Layout (Design)

Date: 2026-10-12 · Status: proposed
Builds on: [`2026-10-12-salesos-simplified-v1.1.md`](2026-10-12-salesos-simplified-v1.1.md) (v1.1 scope is unchanged).
Direction chosen by client: **modern refresh of the existing brand** (keep gold identity, modernise surfaces and layout).

> **Update 2026-10-12 (later the same day):** the client asked to change the colour scheme. The app now uses the **"Midnight Aurora"** palette from the new login page: dark is the default and light is an opt-in from the profile menu, with an indigo → violet → cyan accent. The token names in §3 are unchanged; their values are now in `src/app/globals.css`. Built so far: §4 shell, §5.1 Admin Overview, §6 Orders (cards, new-order sheet, payment sheet), plus the Settings tabs and Employees cards. The full audit at 390 and 1440 px is clean.

## 1. Goals

1. **Fully responsive.** Every screen works at 360, 390, 768, 1024, 1440 px for every role with **no page-level horizontal scroll**.
2. **Modern look** without a rebrand. Keep the gold accent and the "one gold element per screen" rule (master spec §10.4).
3. **Easier overview.** Owner/Admin and employees can read "how are we doing this month" in one glance on any device.

Non-goals: new business features, new metrics or queries (all screens reuse today's service data), changes to v1.1 routes/permissions, dark-mode redesign (dark tokens keep working, just re-tuned).

## 2. Problems found (baseline audit, 2026-10-12)

| Problem | Where |
|---|---|
| Owner/Admin/Accounts have **no navigation below 768 px**. The sidebar is `hidden md:block` and there is no bottom bar. | `DesktopOwnerAdminShell`, `DesktopAccountsShell` |
| Page scrolls sideways on phones by 135–800 px | dashboard, orders, employees, employee detail, catalogue, customer detail, payments/collected, all settings pages |
| Orders spreadsheet is a 10-column table, which is unusable on a phone. The "+ New order" inline row has 7 inputs in a row. | `orders/_components/sheet/OrderSheet.tsx` |
| Sales/Dispatch home overflows by 28–38 px | `home/page.tsx` |
| Accounts nav shows **Settings**, but Accounts is redirected away from `/settings` (dead link) | `DesktopAccountsShell` |

## 3. Visual refresh (tokens only — `src/app/globals.css`)

All screens already read colours from CSS variables, so most of the refresh is done in the tokens:

| Token | Now | New | Why |
|---|---|---|---|
| `--color-bg` | `#F6EFE2` cream | `#F5F3EE` warm grey | calmer page, cards stand out |
| `--color-surface` | `#FFFBF4` | `#FFFFFF` | crisp white cards |
| `--color-surface-2` | `#EFE6D4` | `#F0EDE6` | subtle fills (table header, chips) |
| `--color-border` / `-strong` | `#E7DCC4` / `#D5C7A6` | `#E8E3D8` / `#D6CFBF` | lighter hairlines |
| `--color-gold` | `#9E7B35` | unchanged | brand |
| `--color-gold-soft` | `#F3EAD6` | `#F6EEDC` | active nav / highlights |
| nav tokens | beige | sidebar = `--color-surface` (white) with a hairline border. Active item = `gold-soft` bg + gold text + 3 px gold left marker. | modern, lighter chrome |
| `--shadow-1` / `-2` | — | `0 1px 2px rgba(28,25,18,.04), 0 1px 1px rgba(28,25,18,.03)` / `0 8px 24px rgba(28,25,18,.06)` | softer depth |
| radius | 10/16/22 | unchanged | already modern |

Ink colours stay (AA contrast already validated). Typography: same brand font. A page title is `text-xl md:text-2xl font-semibold tracking-tight`; a KPI figure is `text-2xl md:text-3xl tabular-nums`.

## 4. Responsive app shell (one shared component)

Replace the four shells' duplicated layout with one `AppShell` (`src/app/(app)/_shells/AppShell.tsx`, client parts split out). Each role's shell keeps only its **nav item list** and passes it in. Role switching in `(app)/layout.tsx` is unchanged.

| Width | Layout |
|---|---|
| `< 768` (phone) | Sticky top bar (brand, bell, avatar). **Bottom tab bar for every role** (Owner/Admin: Overview · Orders · Employees · Price list · Settings; Accounts: Overview · Orders · Employees · Price list — Settings removed since Accounts cannot open it; Sales/Dispatch: Overview · Orders). Content gets bottom padding for the bar plus `env(safe-area-inset-bottom)`. |
| `768–1279` (tablet / small laptop) | Collapsed **icon rail** (72 px) with labels as tooltips. Top bar as above. |
| `≥ 1280` | Full sidebar (240 px) with the brand at top. Top bar keeps bell + avatar. |

Main content: `mx-auto w-full max-w-[1400px] px-4 md:px-6 xl:px-8`. `min-w-0` on flex children, so wide tables can never widen the page.

## 5. Overview screens

### 5.1 Admin/Owner Overview (`/dashboard`)
Same data from `adminOverview()`, re-laid out:

1. **Header row:** "October overview" plus a sub-line with today's figures from the existing TodayStrip data (orders today · ₹ booked · ₹ received · last order). On phones the sub-line wraps.
2. **KPI tiles** (`grid-cols-2 lg:grid-cols-4`):
   - Payment received *(gold tile — the one gold element)*
   - To collect (pending ₹ + "N pending over 15 days")
   - Pending orders
   - Orders completed
   Each tile shows the existing delta chip and links to the filtered Orders view (links exist today).
3. **Two-column body** (`lg:grid-cols-5`): **Team targets** (3/5, existing bars, re-styled: name · bar · % · ₹ achieved/target; on phones the ₹ figures move under the bar) and **Needs attention** (2/5, existing "biggest balances to collect" with a Remind button).
4. **Latest orders (live)**, full width. On phones it becomes a stacked list.

### 5.2 Employee Overview (`/home`)
Same data, layout: target ring + "₹ achieved of ₹ target" hero card (full width on phone), then a KPI grid (`grid-cols-2 md:grid-cols-4`), then the existing month bar chart in a card that scales to its container width. Sticky "+ New order" button above the bottom bar on phones (the gold element).

## 6. Orders

- **≥ 1024:** the existing table, restyled. It sits inside a card with `overflow-x-auto` and a sticky header, so the table may scroll inside the card but never the page. Filters sit in one row.
- **< 1024:** a **card list**. Each card shows S.No · date · status pill on top, customer (bold) and product (2-line clamp), contact as a `tel:` link, and a footer of Total · Paid (tap → Add payment) · Balance. The status select is reachable from the card. Filters become: a full-width search, a horizontally scrolling chip row (All / Pending / Completed / Balance due), then Month and Employee selects in a 2-column row.
- **"+ New order" on < 1024** opens a **bottom sheet form** (same fields, same `createOrderV2Action`, same validation copy) instead of the inline row. The inline row stays on desktop.
- **Add payment dialog:** a centred dialog on desktop; a bottom sheet on phones (`max-h-[90dvh]`, inputs 44 px tall).

Logic, actions and validation in `OrderSheet.tsx` are unchanged. The work is presentational: `OrderCard`, `NewOrderSheet` and the responsive container are split into their own files, so `OrderSheet.tsx` (719 lines) gets smaller rather than larger.

## 7. Other screens (responsive pass, no redesign)

| Screen | Change |
|---|---|
| Employees list | Table → cards below 768 (name, role, this month's achieved %, last login) |
| Employee detail | Stack panels; tables wrap in `overflow-x-auto` cards |
| Price list / catalogue | Table in a scroll container; editor sheet full-screen on phones |
| Customer detail, Payments collected | Scroll containers + stacked header |
| Settings pages, Create user, Import | Single column on phones; settings sub-nav becomes horizontal scroll tabs; target grid scrolls inside its card |
| Login | Two-column hero stays on desktop; on phones, form only, with the brand line above |

## 8. Accessibility & UX rules

- Tap targets ≥ 44 px on touch layouts. Inputs ≥ 16 px font on phones (prevents iOS zoom).
- Bottom bar and rail have `aria-label="Primary"` and `aria-current="page"`. Tooltips on the rail are labels, not only `title`.
- Respect `prefers-reduced-motion` for count-ups and sheet transitions.
- Keep existing i18n keys; any new strings are added to both locale files.

## 9. Testing / acceptance

1. Existing typecheck, lint and Vitest suite stay green (525 tests).
2. New Playwright e2e `tests/e2e/responsive.spec.ts`: for each role × widths 390/768/1440, visit each nav route and assert `scrollWidth ≤ innerWidth` and no page errors; at 390, assert the bottom nav is visible.
3. New Playwright e2e `tests/e2e/orders-flow.spec.ts`: create order with advance → add payment → mark completed, at 1440 (inline row) and 390 (sheet + card).
4. Before/after screenshots for Overview, Orders and Home at 390 and 1440 saved to `docs/evidence/ui-refresh/`.

## 10. Build order

1. Tokens + AppShell (fixes the missing phone navigation for all roles).
2. Overview screens (admin + employee).
3. Orders (cards, new-order sheet, payment sheet).
4. Responsive pass on the remaining screens.
5. e2e tests + evidence screenshots.
