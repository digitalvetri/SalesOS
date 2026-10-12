"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { Mini3DKind } from "./mini3dEngine";

// A small live 3D object (coin, parcel, hourglass, growth monitor). three.js is
// loaded on demand; until then (or without WebGL) `fallback` is shown.
export function Mini3D({
  kind,
  className,
  fallback,
}: {
  kind: Mini3DKind;
  className?: string;
  fallback?: React.ReactNode;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const animate = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stop: (() => void) | null = null;
    let cancelled = false;
    import("./mini3dEngine")
      .then(({ mountMini3D }) => {
        if (cancelled) return;
        stop = mountMini3D(canvas, kind, { animate });
        setReady(true);
      })
      .catch(() => {
        /* no WebGL: keep the fallback */
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [kind]);

  return (
    <span aria-hidden className={cn("relative block", className)}>
      {!ready && fallback && <span className="absolute inset-0 flex items-center justify-center">{fallback}</span>}
      <canvas ref={ref} className={cn("h-full w-full transition-opacity duration-500", ready ? "opacity-100" : "opacity-0")} />
    </span>
  );
}
