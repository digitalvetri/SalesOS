"use client";
import * as React from "react";

// Dev-only. Counts [data-gold] nodes in the DOM; shows a red badge if the count ≠ 1.
// Attribute (not prop) keeps SSR/client consistent — one gold element per screen (spec §10.4).
export function GoldAudit() {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const update = () => setCount(document.querySelectorAll("[data-gold]").length);
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true });
    return () => obs.disconnect();
  }, []);

  if (count === null || count === 1) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-3 left-3 z-[9999] rounded-md border border-red-700 bg-red-600 px-2 py-1 text-xs font-semibold text-white shadow-lg"
      title='Spec §10.4: exactly one [data-gold] element per screen.'
    >
      GOLD: {count} (expected 1)
    </div>
  );
}
