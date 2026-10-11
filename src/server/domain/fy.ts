// Financial year helpers (spec BR-03). FY runs April → March. Label format `YY-YY`
// where the first segment is the April-of-the-start-year's two-digit year.
//   2026-04-01 → "26-27"
//   2027-03-31 → "26-27"
//   2027-04-01 → "27-28"
// All inputs are interpreted in IST (spec BR-02) via Intl in `Asia/Kolkata`.

const IST_TZ = "Asia/Kolkata";

/**
 * Returns the FY label for a given Date, interpreted in IST.
 */
export function fyLabelOf(d: Date): string {
  const { year, month } = istYearMonth(d);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${two(startYear)}-${two(endYear)}`;
}

/**
 * Returns the FY start date (April 1, 00:00 IST → UTC) for a Date.
 */
export function fyStart(d: Date): Date {
  const { year, month } = istYearMonth(d);
  const startYear = month >= 4 ? year : year - 1;
  // IST = UTC+5:30, so April 1 00:00 IST = March 31 18:30 UTC the previous day
  return new Date(Date.UTC(startYear, 2, 31, 18, 30, 0));
}

/**
 * Returns the FY end date — March 31 23:59:59.999 IST → UTC — for a Date.
 */
export function fyEnd(d: Date): Date {
  const { year, month } = istYearMonth(d);
  const endYear = month >= 4 ? year + 1 : year;
  // March 31 23:59:59.999 IST = March 31 18:29:59.999 UTC the same day
  return new Date(Date.UTC(endYear, 2, 31, 18, 29, 59, 999));
}

export function istYearMonth(d: Date): { year: number; month: number } {
  // Format YYYY-MM in IST and parse back.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST_TZ,
    year: "numeric",
    month: "numeric",
  }).formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

function two(n: number): string {
  return String(n % 100).padStart(2, "0");
}
