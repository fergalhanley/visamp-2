import type { EngineModule, PropertyView } from "./types";

/**
 * How long a value stays on screen before a newer one replaces it.
 *
 * This is what makes single-frame values visible. `$BEAT` is true for one
 * frame in thirty, so a property tracking it flickers past far too quickly to
 * read — and a slow poll misses it outright, which reads as "beat detection is
 * broken" when it is working. Holding each value briefly also makes a float
 * that changes every frame legible instead of a blur.
 */
const DWELL_MS = 250;

interface Held {
  view: PropertyView;
  shownAt: number;
}

function sameValue(a: PropertyView, b: PropertyView): boolean {
  return a.value === b.value && a.type === b.type && a.swatch === b.swatch;
}

/**
 * Watches the script's properties and reports them whenever the displayed set
 * changes.
 *
 * The engine is sampled every animation frame — that is the only way to catch
 * a value that exists for a single frame — but reporting is paced by
 * `DWELL_MS`, so React sees a handful of updates a second rather than sixty.
 * Sampling fast and reporting slowly is what gets both the transients and the
 * cheap render.
 *
 * Pull rather than push is deliberate: properties are reassigned every frame,
 * so an engine-side event per assignment would mean thousands of boundary
 * crossings a second to feed a panel a human reads a few times a second.
 */
export function startPropertiesBridge(
  engine: EngineModule,
  onChange: (properties: PropertyView[]) => void,
  dwellMs: number = DWELL_MS,
): () => void {
  let held: Held[] = [];
  let frame = 0;

  const sample = (now: number) => {
    frame = requestAnimationFrame(sample);

    let incoming: PropertyView[];
    try {
      incoming = JSON.parse(engine.get_properties()) as PropertyView[];
    } catch {
      // A panicking engine is already reported through the log, and a
      // malformed payload should leave the last good list standing rather than
      // blanking the panel.
      return;
    }

    // A recompile can rename, add or drop properties. That is a different
    // script, not a new value, so it replaces the panel immediately.
    const reshaped =
      incoming.length !== held.length ||
      incoming.some((property, index) => property.name !== held[index]!.view.name);

    if (reshaped) {
      held = incoming.map((view) => ({ view, shownAt: now }));
      onChange(incoming);
      return;
    }

    let changed = false;
    for (const [index, property] of incoming.entries()) {
      const current = held[index]!;
      if (sameValue(current.view, property)) continue;
      // Still inside the dwell: keep showing the older value. The newer one is
      // picked up on a later frame, so nothing is lost, only delayed.
      if (now - current.shownAt < dwellMs) continue;

      held[index] = { view: property, shownAt: now };
      changed = true;
    }

    if (changed) onChange(held.map((entry) => entry.view));
  };

  frame = requestAnimationFrame(sample);

  return () => {
    cancelAnimationFrame(frame);
  };
}
