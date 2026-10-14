// Spec §6 — SVG donut chart. Server-component friendly (no client JS), no
// chart library, flat colours only (no gradients). Each slice is a circle
// stroke with stroke-dasharray; the centre shows the total and a caption, the
// legend lists every slice with its value and share.
import { slicesWithPercent, type Slice } from "@/server/domain/dashboard/pies";

const SIZE = 148;
const STROKE = 20;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const GAP = 2; // px of background between neighbouring slices

const plain = (n: number) => n.toLocaleString("en-IN");

export function DonutChart({
  title,
  subtitle,
  slices,
  formatValue = plain,
  centerValue,
  caption = "total",
}: {
  title: string;
  subtitle?: string;
  slices: Slice[];
  /** Legend values (and the centre total unless `centerValue` is given). */
  formatValue?: (n: number) => string;
  /** Short centre text, e.g. compact ₹ for money charts. */
  centerValue?: string;
  caption?: string;
}) {
  const rows = slicesWithPercent(slices.filter((s) => s.value > 0));
  const total = rows.reduce((a, s) => a + s.value, 0);
  const centre = centerValue ?? formatValue(total);
  const summary =
    rows.length === 0
      ? `${title}: no data yet`
      : `${title}: ${rows.map((s) => `${s.label} ${formatValue(s.value)} (${s.pct}%)`).join(", ")}`;

  const lens = rows.map((s) => (s.value / total) * CIRC);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, x) => a + x, 0));
  const arcs = rows.map((s, i) => {
    const len = lens[i]!;
    const visible = rows.length > 1 ? Math.max(len - GAP, 0.5) : len;
    return { key: s.key, color: s.color, dash: `${visible} ${CIRC - visible}`, offset: -starts[i]! };
  });

  return (
    <section className="surface-card flex min-w-0 flex-col p-4 sm:p-5">
      <header className="mb-3">
        <h2 className="label-caps">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">{subtitle}</p>}
      </header>
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center" role="img" aria-label={summary}>
          <svg width={SIZE * 0.7} height={SIZE * 0.7} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={STROKE} />
          </svg>
          <p className="text-sm text-[color:var(--color-ink-3)]">No data yet</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center xl:flex-col 2xl:flex-row">
          <div className="relative shrink-0" role="img" aria-label={summary}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--color-surface-2)" strokeWidth={STROKE} />
              <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                {arcs.map((a) => (
                  <circle
                    key={a.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={STROKE}
                    strokeDasharray={a.dash}
                    strokeDashoffset={a.offset}
                  />
                ))}
              </g>
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold leading-tight tabular-nums tracking-tight">{centre}</span>
              <span className="text-[11px] text-[color:var(--color-ink-3)]">{caption}</span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-1.5 text-sm">
            {rows.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[color:var(--color-ink-2)]">{s.label}</span>
                <span className="font-medium tabular-nums">{formatValue(s.value)}</span>
                <span className="w-10 text-right text-xs tabular-nums text-[color:var(--color-ink-3)]">{s.pct}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
