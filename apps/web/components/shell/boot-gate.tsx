"use client";

import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import { BrandLockup } from "@/components/brand/logo";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

/**
 * E2.8 / E2.9 — the landing poster and the cold-link play gate are the same
 * surface. It matters that this is a real gate rather than decoration: the
 * WASM module is not fetched and no AudioContext exists until the click, which
 * is also the user gesture browsers require before audio can start.
 */
export function BootGate() {
  const booted = useSessionStore((s) => s.booted);
  const boot = useSessionStore((s) => s.boot);
  const current = useSessionStore((s) => s.current);

  // Kept mounted through the crossfade, then dropped entirely.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!booted) return;
    const timer = window.setTimeout(() => setDismissed(true), 700);
    return () => window.clearTimeout(timer);
  }, [booted]);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center gap-8",
        "bg-[radial-gradient(circle_at_50%_40%,oklch(0.28_0.06_275),oklch(0.12_0.02_275)_60%,oklch(0.08_0_0))]",
        "transition-opacity duration-700",
        booted ? "pointer-events-none opacity-0" : "opacity-100",
      )}
      aria-hidden={booted}
    >
      <BrandLockup className="h-12" />

      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{current.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          by {current.artist.displayName}
        </p>
      </div>

      <button
        type="button"
        onClick={boot}
        className={cn(
          "group flex h-20 w-20 items-center justify-center rounded-full",
          "border border-foreground/20 bg-foreground/5 backdrop-blur",
          "transition hover:scale-105 hover:bg-foreground/10",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
      >
        <span className="sr-only">Play visualisation</span>
        <Play className="h-8 w-8 translate-x-0.5 fill-current" />
      </button>

      <p className="max-w-xs text-center text-xs text-muted-foreground">
        Community-built music visualisations. Bring your own audio — nothing is
        uploaded.
      </p>
    </div>
  );
}
