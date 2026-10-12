// v1.1 §4.2 — target donut ring.
// Fills the arc clockwise from the top; above 100% the whole ring is gold and
// a "target crossed" check icon appears above the %.
import { Check } from "lucide-react";
import Decimal from "decimal.js";
import { formatInr } from "@/lib/formatInr";

const SIZE = 180;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function TargetRing({
  achieved,
  target,
  pct,
  monthLabel,
  daysLeft,
  amountToTarget,
  targetSource,
}: {
  achieved: string;
  target: string;
  pct: number | null; // null = no target
  monthLabel: string; // "October"
  daysLeft: number;
  amountToTarget: string;
  targetSource: "SalesTarget" | "DefaultSetting" | "None";
}) {
  if (pct === null || targetSource === "None") {
    // No target — spec says show "No target set for October. Ask your admin."
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <svg width={SIZE} height={SIZE}>
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={STROKE}
          />
        </svg>
        <div>
          <p className="text-sm font-medium text-[color:var(--color-ink)]">
            No target set for {monthLabel}.
          </p>
          <p className="text-xs text-[color:var(--color-ink-3)]">
            Ask your admin to set one.
          </p>
          <p className="mt-3 text-base font-semibold tabular-nums">
            {formatInr(achieved)} <span className="text-xs text-[color:var(--color-ink-3)]">booked</span>
          </p>
        </div>
      </div>
    );
  }

  const over = pct >= 100;
  const filled = Math.min(pct, 100) / 100;
  const dashOffset = CIRC * (1 - filled);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-2)"
            strokeWidth={STROKE}
          />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-gold)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {over && (
            <Check
              className="h-5 w-5 text-[color:var(--color-ok)]"
              aria-label="Target crossed"
            />
          )}
          <div className="text-3xl font-bold tabular-nums tracking-tight text-[color:var(--color-ink)]">
            {pct}%
          </div>
          <div className="text-sm font-semibold tabular-nums text-[color:var(--color-ink-2)]">
            {formatInr(achieved)}
          </div>
          <div className="text-[11px] text-[color:var(--color-ink-3)]">
            of {formatInr(target)}
          </div>
        </div>
      </div>
      {over ? (
        <p className="text-sm font-medium text-[color:var(--color-ok)]">
          Target crossed · {new Decimal(achieved).minus(target).abs().greaterThan(0)
            ? `+${formatInr(new Decimal(achieved).minus(target).toString())} over`
            : "right on target"}
        </p>
      ) : (
        <p className="text-sm text-[color:var(--color-ink-2)]">
          <span className="font-semibold">{formatInr(amountToTarget)}</span> more to reach target
        </p>
      )}
      <p className="text-xs text-[color:var(--color-ink-3)]">
        {daysLeft === 0 ? "Last day of the month" : `${daysLeft} days left`}
      </p>
    </div>
  );
}
