// Single source of truth for the company / product name.
// Changing this changes every surface. Do not inline the name anywhere else.
export const BRAND = {
  name: "Kumar Food Machinery",
  shortName: "KFM",
  tagline: "Engineering Food Excellence",
  since: "Since 1999",
  product: "Orders · Production · Service",
} as const;

// Logo colours (from the KFM logo) — keep in sync with public/brand/*.svg and src/app/icon.svg.
export const LOGO = { green: "#406E32", charcoal: "#2D2B2C", greenOnDark: "#8CC47A" } as const;

/** First month the app was used for real (fresh start 2026-10-15). Reports never show earlier months or years. */
export const GO_LIVE_YM = "2026-10";
