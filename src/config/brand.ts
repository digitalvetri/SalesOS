// Single source of truth for the company / product name.
// Changing this changes every surface. Do not inline the name anywhere else.
export const BRAND = {
  name: "Kumaar Industries",
  shortName: "Kumaar",
  tagline: "We are specialists in Special Purpose Machineries",
  product: "Orders · Payments · Dispatch",
} as const;

// Logo colours (from the company logo) — keep in sync with src/app/icon.svg.
export const LOGO = { blue: "#1F6FB5", blueDark: "#174F86", red: "#D7262E" } as const;
