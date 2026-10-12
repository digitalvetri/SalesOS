"use client";
import * as React from "react";

// Mounts the Three.js sidebar scene. three.js is code-split and only fetched
// on wide screens (the full sidebar is ≥ 1280 px), so phones never download it.
export function SidebarScene() {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const host = ref.current;
    if (!host || !window.matchMedia("(min-width: 1280px)").matches) return;
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stop: (() => void) | null = null;
    let cancelled = false;
    import("./sidebarScene3d")
      .then(({ startSidebarScene }) => {
        if (!cancelled) stop = startSidebarScene(host, { animate });
      })
      .catch(() => {
        /* WebGL unavailable — the sidebar simply shows no scene */
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return <div ref={ref} aria-hidden className="h-full min-h-[260px] w-full" />;
}
