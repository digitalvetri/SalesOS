"use client";
// "Booked · last 12 months" (§9, §11.7). One series → no legend (the title names
// it). Columns ≤ 24px with a 4px rounded data-end, square at the baseline;
// hairline grid; hover tooltip; each column links to that month's orders; a
// table view carries every value (dataviz: identity never colour-only).
import * as React from "react";
import Link from "next/link";
import { formatInr } from "@/lib/formatInr";
import { compactInr, niceTicks } from "@/lib/compactInr";

type Point = { month: string; booked: string; href: string };

const W = 640;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 48 };
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const monthName = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });

export function TrendChart({ points, title }: { points: Point[]; title: string }) {
  const [hover, setHover] = React.useState<number | null>(null);
  const values = points.map((p) => Number(p.booked));
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1] || 1;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / points.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;

  return (
    <figure className="m-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--color-ink-3)" className="tabular-nums">
                {compactInr(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) => {
            const v = values[i]!;
            const x = PAD.left + band * i + (band - barW) / 2;
            const h = Math.max(0, y(0) - y(v));
            const r = Math.min(4, h, barW / 2);
            // Rounded top, square base.
            const path =
              h === 0
                ? ""
                : `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + barW - r} Q${x + barW},${y(v)} ${x + barW},${y(v) + r} V${y(0)} Z`;
            const month = Number(p.month.slice(5)) - 1;
            return (
              <g key={p.month}>
                {path && <path d={path} fill="var(--color-chart)" opacity={hover === null || hover === i ? 1 : 0.55} />}
                <text x={PAD.left + band * i + band / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--color-ink-3)">
                  {MONTHS[month]}
                </text>
                {/* Hit target: the whole band, taller than the mark. */}
                <Link
                  href={p.href}
                  aria-label={`${monthName(p.month)}: ${formatInr(p.booked)}`}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                >
                  <rect x={PAD.left + band * i} y={PAD.top} width={band} height={plotH} fill="transparent" />
                </Link>
              </g>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--color-border-strong)" strokeWidth={1} />
        </svg>
        {hover !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -translate-x-1/2 rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1 text-xs shadow-[var(--shadow-2)]"
            style={{
              left: `${((PAD.left + band * hover + band / 2) / W) * 100}%`,
              top: `${(Math.max(PAD.top, y(values[hover]!) - 34) / H) * 100}%`,
            }}
          >
            <div className="text-[color:var(--color-ink-3)]">{monthName(points[hover]!.month)}</div>
            <div className="font-medium tabular-nums">{formatInr(points[hover]!.booked)}</div>
          </div>
        )}
      </div>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-[color:var(--color-ink-3)]">Table view</summary>
        <table className="mt-2 w-full">
          <tbody>
            {points.map((p) => (
              <tr key={p.month} className="border-t border-[color:var(--color-border)]">
                <td className="py-1">{monthName(p.month)}</td>
                <td className="py-1 text-right tabular-nums">{formatInr(p.booked)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
