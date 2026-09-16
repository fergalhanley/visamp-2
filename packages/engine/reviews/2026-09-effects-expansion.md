# Whole-frame effect expansion — VIS-115

Engine 5.2 adds all 18 effect calls approved in the task conversation, including
bloom and bitmap displacement previously suggested as later work. The definitive
API and parameter contracts live in the [language reference](../../../apps/docs/src/effects/frame-effects.md).
No existing Visript syntax is renamed and no stored-source migration is required.

## Decisions

- Effects share the ordered `Filter` operation stream and GPU output compositor
  introduced by VIS-114. `Kind` values match shader operation IDs; `params` carries
  each effect's documented parameters, `color` its gap colour, and `asset` its
  optional bitmap handle. The existing 32-call budget counts both filters and
  new effects. Scramble stays in the earlier feedback stage.
- New effects evaluate supplied expressions once in source order, reject invalid
  types/ranges, and retain statement locations. Literal numeric mistakes and enum
  values are also diagnosed by the resolver. Counts require integer values.
- The owner explicitly selected repeated triangular reflections for kaleidoscope
  branches. Branch 1 uses angular mirroring; branches 2–6 add an outer triangular
  boundary and repeat reflections across that boundary and the wedge edges.
- Pixelation samples cell centres. Triangle and hexagon grids tile without holes
  at zero gap. Circles, pentagons and stars intentionally retain spaces. Stars use
  outer diameter; regular polygons use side length. Orientation rotates the grid
  about the canvas centre. Gap colour uses premultiplied compositing.
- Bloom preserves a separate copy of the source, extracts bright regions, reuses
  the existing Gaussian pyramid, and adds the result. Glow can extend alpha.
  It is display-range post-processing, not HDR lighting.
- Displacement maps stretch across the frame and use straight red/green channels
  as signed X/Y offsets; map alpha attenuates offsets. Asset loading and access
  remain host-owned. Map GPU textures are reused by asset ID/version plus an asset
  store epoch, preventing stale maps after clear/re-register. Unused map cache
  entries are removed each frame; reset/context recreation drops GPU resources.
- New effect numeric magnitudes are bounded at 1,000,000; positive dimensions
  start at 0.001 pixels to avoid GPU divisions by flushed subnormal numbers.
  Smaller Gaussian sigma is effectively identity. Bloom has explicit threshold,
  intensity and radius bounds. No per-frame CPU pixel readback is introduced.

## Verification and samples

Native tests cover signatures, both contexts/overlay, literal/runtime diagnostics,
argument types/count bounds, call order, budget, swirl angles and asset lifecycle.
`tests/browser/effects.html` verifies all effects against capture, neutral
operations, shape coverage/alpha, direction/symmetry, bloom chaining, map updates
and steady texture reuse. Existing filter/capture suites cover resizing and
context recovery of the shared pipeline.

The [21-script sample pack](../examples/effects/README.md) includes a safe SQL
import (private records, deterministic IDs, preserve edits on re-import), 18
isolated effect scripts and three combinations. `effect-samples.html` validates
live rendering/capture and produces a visual gallery. The displacement sample
uses the previously supplied bitmap; an optional mathematical PNG map is bundled
for uploading. Browser fixtures register it locally without external access.

Cross-browser/device performance and visual acceptance remain owner review work.
Thumbnail capture continues to rerender a fresh fixed-size frame, excluding live
accumulated feedback history. SQL is prepared for the owner; it is not applied.
