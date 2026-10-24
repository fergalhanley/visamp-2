"use client";

import { useRef, useState } from "react";
import { VisampCanvas, type VisampCanvasHandle } from "@visamp/player";
import { source, modulation } from "../../../../../dev/lfo-phase1";

/** Development smoke test only; the editor panel belongs to Phase 2. */
export function LfoDemo() {
  const player = useRef<VisampCanvasHandle>(null);
  const [active, setActive] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">LFO rotation and zoom</h1>
      <p>Two oscillators at 120 BPM. Turning modulation off restores rotation 0 and zoom 1.</p>
      <div className="flex flex-wrap gap-4">
        <button type="button" onClick={() => setActive(value => !value)}>{active ? "Pause" : "Play"}</button>
        <button type="button" aria-pressed={enabled} onClick={() => setEnabled(value => !value)}>Modulation {enabled ? "on" : "off"}</button>
        <button type="button" onClick={() => player.current?.setAnimationTime(500)}>Seek to 0.5 s</button>
        <button type="button" onClick={() => player.current?.setAnimationTime(null)}>Release seek</button>
      </div>
      <div className="relative aspect-video overflow-hidden bg-black">
        <VisampCanvas ref={player} source={source} modulation={enabled ? modulation : null} active={active}
          onLog={entry => { if (entry.level === "error") setError(entry.message); }} />
      </div>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
