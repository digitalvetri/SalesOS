# Kumaar Industries brand + "Forest & White" theme — design

Date: 2026-10-13 · Logo reading A chosen from 4. Theme: first "Steel Grey Industrial" (rejected after seeing it live: "very bad"), then **G1 · Forest & White** chosen from 4 green-and-white mock-ups.

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
| Page / surface / surface-2 | #FFFFFF / #FFFFFF / #F3F8F5 | #0F1A14 / #15231B / #1B2C22 |
| Ink 1-3 | #13241B / #3A4D42 / #5D6F64 | #E6F0EA / #AFC5B7 / #82998B |
| Accent (buttons, links, selected, completed) | #2D6A4F | #52B788 |
| Pending / to collect (warn) | #C21F27 on #FBE9EA, bars #D7262E | #FF7A80 on #3A1A1F |
| Sidebar + hero (money) tile | #1B4332 | #0B140F / #1B4332 |

Rules kept: flat colours only, no gradients, no purple. Logo keeps its own blue/red (white badge on green).
Charts: sales = green, received = red. 3D sidebar city and dashboard 3D icons in forest greens (gold coin unchanged).
Login page: deep forest (#10261B) with light-green accents.
