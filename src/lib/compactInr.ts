// Axis-tick money: ₹0 / ₹50K / ₹5L / ₹1.2Cr (Indian grouping). Pure.
export function compactInr(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  const fmt = (v: number) => (v >= 10 || Number.isInteger(v) ? Math.round(v).toString() : v.toFixed(1));
  if (abs >= 1e7) return `${sign}₹${fmt(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${fmt(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${fmt(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

/** 3–4 clean ticks from 0 up to ≥ max (1/2/2.5/5 × 10^k steps). */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v < max + step; v += step) ticks.push(v);
  return ticks;
}
