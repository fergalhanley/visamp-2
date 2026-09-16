# VIS-112 — Visript 5.1 delivery

Implements the approved NOW scope of the drawing expansion, plus zero-based
`$FRAME_INDEX` and local calendar hour/minute/weekday/month/year values.
The authoritative public contract is
[Creative Drawing Tools](../../../apps/docs/src/drawing/creative-tools.md) and
[System Values](../../../apps/docs/src/programming/system-values.md).

## Decisions

- Calendar follows the viewer's timezone; Sunday/January are zero. Frame index
  resets on successful activation. Capture clones the current clock snapshot.
  Existing `$FRAME_COUNT` and elapsed-time engine-lifetime epochs are preserved.
- World rectangles extend from their corner along +X/+Y. Polygon coordinates are
  XY plus optional Z. World strokes use bounded camera-plane triangle ribbons.
- World clear/background/`gfx::clear` all set the same frame clear; last wins.
- One final overlay, with its own 2D transform and blend state. Filters/feedback
  apply to the combined frame. Unsupported world text/gradients are diagnosed.
- Preserve existing backend blend semantics. Canvas `none` replaces the canvas,
  while WebGL `none` replaces covered fragments; multiply also differs with alpha.
  These differences are documented, rather than silently changing existing 3D visuals.
- Seeded hash/value-noise version 1 is stateless on CPU/GPU. Colour mixing uses
  linear-light RGB. GPU invalid per-vertex inputs follow existing culling rules.
- Dynamic mesh buffers/VAOs are explicitly released, including after failed frames.
  Static model caching and more advanced geometry remain roadmap work.

## Verification (16 September 2026)

- 288 native Rust tests passed, including clock rollover/pause/capture snapshots,
  helper boundaries, required arguments, planar geometry and invalid combinations.
- Release native compiler and bundled WASM both report 5.1.0; browser-target WASM built.
- Chromium/WebGL2 browser harness: 15 drawing checks, including all six live samples
  and captures, CPU/GPU seeded vectors, translucent joins, sprite roll, flat versus
  Lambert normals, images/gradients and overlay composition.
- Existing capture harness: fixed-size PNG, 20 captures reusing a context, assets,
  context loss, source locations, state preservation and switching back to 2D.
- Existing point-cloud harness: 21 pixel cases, 147456 points, no shader recompiles,
  one model upload over 20 frames. Existing grid harness: colour/depth/program
  switching, large grid/history and capture checks passed.
- Web TypeScript and targeted ESLint passed. mdBook build passed. Existing generic
  editor namespace/system-value token rules cover the new names without changes.
- Six scripts validate natively and in WASM. The optional private-sample SQL import
  is generated from those sources and skips existing IDs. It was not executed.

Browser fixtures are in `tests/browser/drawing-expansion.html`; serve the repository
locally after building `pkg-validator`. Samples/import are in `examples/drawing`.
This is functional desktop verification, not a hardware performance guarantee.
Physical mobile benchmarks and owner live validation remain review activities.

Deferred NEXT/LATER scope is in [VIS-113](https://linear.app/visamp/issue/VIS-113).
No existing stored-source migration is required. The owner's staged Capture thumb
label change is excluded from this implementation commit.
