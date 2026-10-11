"use client";
// §10.6: the only number motion — a single 400ms count-up on dashboard hero
// figures, skipped under prefers-reduced-motion.
import * as React from "react";
import { formatInr } from "@/lib/formatInr";

export function CountUp({ value, className }: { value: string; className?: string }) {
  const target = Number(value);
  const [shown, setShown] = React.useState(target);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || target === 0) return;
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 400);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(target * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // Screen readers get the final value only.
  return (
    <span className={className}>
      <span aria-hidden>{formatInr(shown === target ? value : shown)}</span>
      <span className="sr-only">{formatInr(value)}</span>
    </span>
  );
}
