# Kumaar Industries brand + "Steel Grey Industrial" theme — design

Date: 2026-10-13 · Chosen by the client from 13 mock-ups (theme 2, logo reading A).

## Brand
- Name everywhere: **Kumaar Industries** (`src/config/brand.ts`; short name "Kumaar" for the installed-app label).
  Tagline: "We are specialists in Special Purpose Machineries". "SalesOS" no longer appears in the UI.
- Mark: blue "K" (stem, arm, leg) + red "i" (bar + dot), flat vector (`src/components/app/Logo.tsx`,
  `src/app/icon.svg`). Logo colours: blue `#1F6FB5`, red `#D7262E`, wordmark navy `#1E2B4A`.
- On dark surfaces (sidebar, login) the full-colour mark sits on a white rounded badge so the logo
  colours stay exact. Favicon / app icons / maskable icons: full-colour mark on white.

## Theme tokens (`src/app/globals.css`) — names unchanged
| Role | Light | Dark |
|---|---|---|
| Page / surface / surface-2 | #F2F3F5 / #FFFFFF / #F4F5F7 | #16191D / #1F2328 / #262B31 |
| Ink 1-3 | #1B1F24 / #3E4650 / #6B7480 | #E8ECF1 / #B4BDC8 / #8C96A3 |
| Accent (buttons, links, selected, completed) | #1F6FB5 | #4C9BEA |
| Pending / to collect (warn) | #C21F27 on #FBE9EA, bars #D7262E | #FF7A80 on #3A1A1F |
| Sidebar + hero (money) tile | #2B3138 | #0F1114 / #262B31 |

Rules kept: flat colours only, no gradients, no purple. Charts: sales = blue, received = red.
3D sidebar city and dashboard 3D icons recoloured to steel / blue / red (gold coin unchanged).
