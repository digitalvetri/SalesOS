"use client";
// v1.1 §4.2 — "Last 6 months — achieved vs target".
// Simple SVG; one bar per month, dashed horizontal line = target. Clicking a
// bar navigates to the orders sheet filtered to that month.
import Link from "next/link";
import Decimal from "decimal.js";
import { formatInr } from "@/lib/formatInr";

const BAR_W = 44;
const GAP = 16;
const H = 160;

export function MonthBarChart({
  rows,
  target,
}: {
  rows: Array<{ ym: string; label: string; achieved: string }>;
  target: string; // decimal
}) {
  const t = new Decimal(target);
  const max = rows.reduce(
    (m, r) => Decimal.max(m, new Decimal(r.achieved)),
    t.greaterThan(0) ? t.times(1.1) : new Decimal(0),
  );
  const maxN = max.isZero() ? new Decimal(1) : max;
  const w = rows.length * BAR_W + (rows.length - 1) * GAP;

  function barHeight(v: string): number {
    return Math.max(2, Math.round(new Decimal(v).div(maxN).times(H - 24).toNumber()));
  }

  const targetY = t.greaterThan(0)
    ? Math.round(H - 10 - new Decimal(target).div(maxN).times(H - 24).toNumber())
    : null;

  return (
    <div className="w-full overflow-x-auto">
      <svg width={w} height={H} role="img" aria-label="Last 6 months achieved vs target">
        {/* Base axis */}
        <line
          x1={0}
          y1={H - 10}
          x2={w}
          y2={H - 10}
          stroke="var(--color-border)"
          strokeWidth={1}
        />
        {/* Bars */}
        {rows.map((r, i) => {
          const x = i * (BAR_W + GAP);
          const h = barHeight(r.achieved);
          const y = H - 10 - h;
          const met = t.greaterThan(0) && new Decimal(r.achieved).greaterThanOrEqualTo(t);
          return (
            <g key={r.ym}>
              <Link href={`/orders?m=${r.ym}`}>
                <rect
                  x={x}
                  y={y}
                  width={BAR_W}
                  height={h}
                  rx={6}
                  fill={met ? "var(--color-ok)" : "var(--color-gold)"}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                />
              </Link>
              <text
                x={x + BAR_W / 2}
                y={H - 2}
                textAnchor="middle"
                className="fill-[color:var(--color-ink-3)] text-[10px] uppercase tracking-wide"
              >
                {r.label.split(" ")[0]}
              </text>
              {new Decimal(r.achieved).greaterThan(0) && (
                <text
                  x={x + BAR_W / 2}
                  y={y - 4}
                  textAnchor="middle"
                  className="fill-[color:var(--color-ink-2)] text-[10px] tabular-nums"
                >
                  {formatInr(r.achieved)}
                </text>
              )}
            </g>
          );
        })}
        {/* Target line */}
        {targetY !== null && (
          <>
            <line
              x1={0}
              y1={targetY}
              x2={w}
              y2={targetY}
              stroke="var(--color-ink-2)"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <text
              x={w - 2}
              y={targetY - 4}
              textAnchor="end"
              className="fill-[color:var(--color-ink-2)] text-[10px] tabular-nums"
            >
              target {formatInr(target)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
