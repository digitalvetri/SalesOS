// The app is English-only. Kept as a constant so next-intl and <html lang> share it.
export const LOCALE = "en" as const;
export type Locale = typeof LOCALE;
