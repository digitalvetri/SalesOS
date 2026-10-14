# Kumar Food Machinery (KFM) brand + "Green & White" theme — design

Date: 2026-10-13, updated 2026-10-15 to the client's final KFM logo (vector PDF "KFM Logo Final File.pdf").
History: "Kumaar Industries" Ki mark + "Forest & White" (2026-10-13) → replaced by the KFM logo and a
theme tuned to its green. Earlier rejected: "Steel Grey Industrial" ("very bad"), teal.

## Brand
- Name everywhere: **Kumar Food Machinery** (`src/config/brand.ts`; short name "KFM" for the installed-app label).
  Tagline "Engineering Food Excellence", "Since 1999". Product line "Orders · Production · Service".
- Logo colours: green `#406E32`, charcoal `#2D2B2C` (`LOGO` in `brand.ts`); light green `#8CC47A` for dark backgrounds.
- Vector artwork (traced 1:1 from the PDF with `pdftocairo -svg`, background removed, tight viewBox):
  - `public/brand/kfm-lockup.svg` — full logo (emblem | KUMAR FOOD MACHINERY, Since 1999, tagline) for light backgrounds
  - `public/brand/kfm-lockup-light.svg` — same, charcoal → white, green → #8CC47A, for dark backgrounds (login)
  - `public/brand/kfm-emblem.svg` — the KFM ring mark only, square viewBox
- `src/components/app/Logo.tsx`: `LogoMark` (emblem; `tile` = white rounded badge for dark surfaces),
  `Wordmark` ("KUMAR / FOOD MACHINERY" in logo green + charcoal; follows theme tokens, `onDark` = white + light green), `Logo`.
- Favicon `src/app/icon.svg` = emblem on a white rounded square; `apple-icon.png` (180), `public/icons/icon-{192,512}.png`
  (white rounded tile), `maskable-{192,512}.png` (full-bleed white, emblem in the centre 62%, inside the 80% safe zone).

## Theme tokens (`src/app/globals.css`) — names unchanged
| Role | Light | Dark |
|---|---|---|
| Page / surface / surface-2 | #FFFFFF / #FFFFFF / #F4F7F2 | #111511 / #181D17 / #1F261D |
| Border / strong | #E4EBE0 / #CCD8C6 | #2A3427 / #364333 |
| Ink 1-3 (charcoal family) | #2D2B2C / #4A4748 / #6B6869 | #ECEFEA / #B7C0B2 / #8B9586 |
| Accent fill (buttons) / hover | #406E32 / #355C29 (white text 6.0:1) | #406E32 / #4A7A3C |
| "Gold" accent text, ok, info | #406E32 on #ECF3E8 | #8CC47A on #1E3318 |
| Pending / to collect (warn) | #C21F27 on #FBE9EA, bars #D7262E | #FF7A80 on #3A1A1F |
| Sidebar + hero (money) tile | #24401C (white text 11.5:1), active item #406E32 | sidebar #0D110C, hero #24401C |

Rules kept: flat colours only, no gradients, no purple. Red is used only for pending / money to collect.
3D sidebar scene and dashboard 3D icons use the logo green family (#406E32 / #5A8F48 / #7AB567 / #A9D49A; gold coin unchanged).
Login page: deep logo green (#172A12) with #8CC47A accents and the full light lockup.
Theme colour (browser bar / manifest): #24401C. Service worker cache: `kfm-v4`.
