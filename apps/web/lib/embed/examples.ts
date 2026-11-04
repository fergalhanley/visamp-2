import mandala from "../../../../packages/engine/examples/drawing/02-transform-mandala.viscript";
import crystalBloom from "../../../../packages/engine/examples/effects/19-crystal-bloom.viscript";
import pointerOrbits from "../../../../packages/engine/examples/input/01-pointer-orbits.viscript";

export type EmbedVisual = {
  id: string;
  title: string;
  source: string;
  credit: string;
  href: string;
  poster?: string;
  hint?: string;
};

/** Real, asset-free examples shipped with the Visamp engine. No database required. */
export const EMBED_EXAMPLES: EmbedVisual[] = [
  {
    id: "mandala",
    title: "Transform Mandala",
    source: mandala,
    credit: "Visamp engine example",
    href: "/player",
  },
  {
    id: "crystal-bloom",
    title: "Crystal Bloom",
    source: crystalBloom,
    credit: "Visamp engine example",
    href: "/player",
  },
  {
    id: "pointer-orbits",
    title: "Pointer Orbits",
    source: pointerOrbits,
    credit: "Visamp engine example",
    href: "/player",
    hint: "Move over the canvas. Hold a pointer button or Shift to change the orbit.",
  },
];
