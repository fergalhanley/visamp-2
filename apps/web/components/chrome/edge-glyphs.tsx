"use client";

import { useCompactChrome } from "@/hooks/use-compact-chrome";
import { useChromeStore } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";

/** Both glyphs are the same asset; the V is the A turned over. */
const GLYPH_SIZE = "20vh";

function glyphStyle(rotated: boolean) {
  return {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    // Masked rather than an <img> so the mark still takes currentColor and the
    // idle-fade opacity, instead of being locked to the file's white fill.
    maskImage: "url(/VA.svg)",
    WebkitMaskImage: "url(/VA.svg)",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    WebkitMaskPosition: "center",
    maskSize: "contain",
    WebkitMaskSize: "contain",
    backgroundColor: "currentColor",
    transform: rotated ? "rotate(180deg)" : undefined,
  };
}

/**
 * E2.3 — the V and A glyphs sit at the screen edges and stay faintly visible
 * even when the rest of the chrome has faded, because they are the only clue
 * that there is anything to reveal.
 */
export function EdgeGlyphs() {
  const visible = useChromeStore((s) => s.visible);
  const vOpen = useChromeStore((s) => s.vOpen);
  const aOpen = useChromeStore((s) => s.aOpen);
  const togglePanel = useChromeStore((s) => s.togglePanel);
  const compact = useCompactChrome();

  const base = cn(
    "fixed top-1/2 z-30 -translate-y-1/2 select-none",
    "transition-opacity duration-500",
  );

  // Fully invisible once the chrome is at rest — the glyphs only exist while
  // the chrome has been woken by movement.
  const opacity = (open: boolean) =>
    open || !visible ? "opacity-0" : "opacity-40";

  return (
    <>
      <button
        type="button"
        aria-label="Browse visualisations"
        onClick={() => compact && togglePanel("v")}
        className={cn(
          base,
          "left-[20px]",
          opacity(vOpen),
          compact ? "" : "pointer-events-none",
        )}
      >
        <span className="block" style={glyphStyle(true)} />
      </button>
      <button
        type="button"
        aria-label="Audio source"
        onClick={() => compact && togglePanel("a")}
        className={cn(
          base,
          "right-[20px]",
          opacity(aOpen),
          compact ? "" : "pointer-events-none",
        )}
      >
        <span className="block" style={glyphStyle(false)} />
      </button>
    </>
  );
}
