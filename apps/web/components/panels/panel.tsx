"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { useCompactChrome } from "@/hooks/use-compact-chrome";
import { useChromeStore, type PanelSide } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";

/** Dragging a sheet down by more than this dismisses it. */
const DISMISS_PX = 90;

function isTextEntry(node: EventTarget | null): boolean {
  return (
    node instanceof HTMLElement &&
    (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.isContentEditable)
  );
}

interface PanelProps {
  side: PanelSide;
  label: string;
  children: ReactNode;
}

/**
 * A panel overlays the canvas — it never displaces it (E2.4, E2.5). Both panels
 * can be open at once and the canvas keeps its dimensions throughout.
 *
 * On a touch device or a narrow window this becomes a bottom sheet with a drag
 * handle (E2.11).
 */
export function Panel({ side, label, children }: PanelProps) {
  const open = useChromeStore((s) => (side === "v" ? s.vOpen : s.aOpen));
  const closePanel = useChromeStore((s) => s.closePanel);
  const setPinned = useChromeStore((s) => s.setPinned);
  const compact = useCompactChrome();

  const hovering = useRef(false);
  const sheetRef = useRef<HTMLElement | null>(null);
  const dragStart = useRef<number | null>(null);

  const onPointerEnter = () => {
    hovering.current = true;
  };

  const onPointerLeave = () => {
    hovering.current = false;
    // Tap-to-reveal on touch: leaving isn't a dismissal there.
    if (!compact) closePanel(side);
  };

  // E2.4a — typing in a search box or a comment draft must survive the cursor
  // drifting back over the canvas.
  const onFocusCapture = (event: React.FocusEvent) => {
    if (isTextEntry(event.target)) setPinned(side, true);
  };

  const onBlurCapture = (event: React.FocusEvent) => {
    if (!isTextEntry(event.target)) return;
    setPinned(side, false);
    // The pointer may have wandered off while the field held focus; honour the
    // close that was suppressed at the time.
    if (!hovering.current && !compact) closePanel(side);
  };

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null || !sheetRef.current) return;
    const delta = Math.max(0, event.clientY - dragStart.current);
    sheetRef.current.style.transform = `translateY(${delta}px)`;
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStart.current === null || !sheetRef.current) return;

    const delta = event.clientY - dragStart.current;
    sheetRef.current.style.transform = "";
    dragStart.current = null;

    if (delta > DISMISS_PX) {
      setPinned(side, false);
      closePanel(side);
    }
  };

  if (compact) {
    return (
      <aside
        ref={sheetRef}
        aria-label={label}
        onFocusCapture={onFocusCapture}
        onBlurCapture={onBlurCapture}
        className={cn(
          "visamp-surface fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] flex-col",
          "rounded-t-2xl border-t transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          className="flex shrink-0 cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
        >
          <div className="h-1 w-10 rounded-full bg-foreground/25" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={label}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      className={cn(
        "visamp-surface fixed top-0 z-40 flex h-full w-[22rem] flex-col",
        "transition-transform duration-300 ease-out",
        side === "v" ? "left-0 border-r" : "right-0 border-l",
        open
          ? "translate-x-0"
          : side === "v"
            ? "-translate-x-full"
            : "translate-x-full",
      )}
    >
      {children}
    </aside>
  );
}

/**
 * The invisible strip along each edge that opens the panel on approach. Kept
 * separate from the panel so the panel itself can start fully off-screen.
 */
export function PanelHotZone({ side }: { side: PanelSide }) {
  const openPanel = useChromeStore((s) => s.openPanel);
  const compact = useCompactChrome();

  if (compact) return null;

  return (
    <div
      aria-hidden
      data-hot-zone={side}
      onPointerEnter={() => openPanel(side)}
      className={cn(
        // Below the glyphs (z-30) so a tap always lands on the glyph itself.
        "fixed top-0 z-20 h-full w-[20vw]",
        side === "v" ? "left-0" : "right-0",
      )}
    />
  );
}
