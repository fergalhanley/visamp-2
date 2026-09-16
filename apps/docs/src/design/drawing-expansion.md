<!-- audience: internal -->

# Drawing expansion proposal

**Status: NOW scope approved and implemented in Visript 5.1 under [VIS-112](https://linear.app/visamp/issue/VIS-112).**
The current contract is [Creative Drawing Tools](../drawing/creative-tools.md);
NEXT/LATER work is in [VIS-113](https://linear.app/visamp/issue/VIS-113).
The remainder preserves the original pre-implementation review.

**Original audit:** Reviewed against Visript 5.0.0 at
`93ad44c`, 16 September 2026. Tracking: [VIS-111](https://linear.app/visamp/issue/VIS-111).
The language is **Visript**; scripts keep the `.viscript` extension.

## Recommendation

Expand the combinations authors can express: connected shapes, shared transforms,
images, smooth motion and colour. Complete the existing cross-context promises
before adding more specialist solids. Keep the language immediate-mode: each
`render` describes a frame; the engine owns caching, batching and GPU resources.

**Add now, in two bounded increments:**

1. **Foundation:** truthful availability/diagnostics, 2D transforms and blending,
   reliable 3D planar primitives and overlays, frame timing and interpolation.
2. **Creative vocabulary:** polylines, cubic Bézier curves, arcs, images,
   rounded rectangles, colour mixing/radial gradients, deterministic noise/random
   sampling and array length. Support connected lines in both contexts.

**Next:** tubes/ribbons, 2D point clouds, general paths/clipping, grid improvements,
normal feedback/bloom and reusable geometry. **Later:** rich materials/shadows,
model animation, vector/path extrusion, shader authoring and persistent simulation.

This is a recommendation for scope, not approval to implement or a delivery-date
estimate. New syntax below is illustrative API design, not runnable today.

## 1. What exists today

The implementation is the source for this inventory; some current docs describe
intended support ahead of the renderer.

| Area | Available | Important boundary |
|---|---|---|
| 2D drawing | Clear/background, circle, ellipse, rect, polygon, line, text | No direct image draw, connected stroke, arc, curve, group transform or blend API in 2D |
| 2D paint | RGB/HSL with alpha, named colours, linear gradients | Polygon lacks outline options; circle/rect/ellipse choose fill **or** stroke; no radial gradients or colour interpolation |
| 3D solids | Cube, sphere, plane, cylinder, cone, torus | Most familiar solids already covered; more solids alone bring modest expressive gain |
| 3D assets | Mesh, model, billboard sprite; bitmap/vector textures | Geometry assets, not full animated glTF scenes/material systems; no direct 2D image API |
| Procedural GPU fields | Point clouds and triangle grids | 3D-only; constrained expressions, not arbitrary Visript; grid is unlit and lacks textures/normals/wireframe |
| Composition | 3D transform stack, perspective/orthographic cameras, camera orbit | Transforms unavailable in 2D; overlay is accepted but not a completed screen-space rendering pass |
| Lighting/state | Ambient, directional, point; depth, cull, alpha/additive/multiply/none blending | 3D-only; flat and Lambert currently share the same lit shader path |
| Effects | Whole-frame CSS filters and scramble with retained feedback | Existing post-processing **does** exist; no general bloom, layer graph or undistorted feedback control |
| Supporting values | Math basics, arrays/array properties/indexed writes, `array::filled`, time/frame values | No array length expression, lerp/map/wrap/smoothstep, seeded random/noise, or frame-delta value |
| Interaction/audio | Audio detection and pointer/keyboard state/events | Reuse these inputs; drawing expansion should not create parallel input APIs |

### Existing contract gaps: fix before extending them

- `draw::rect`, `circle`, `ellipse`, `polygon`, `line`, `text`, `clear` and
  `background` pass the 3D signature checks but fall into `record_draw`'s
  “not rendered in 3d mode yet” error. This also affects the advertised overlay
  text example. `gfx::overlay` stores a flag, but there is no overlay projection
  or pass in the renderer. Deliver actual support or a precise compile diagnostic
  for deferred combinations; parser acceptance is not feature completion.
- The signature helper grants common 3D arguments broadly, even to clear/background.
  Each call needs an explicit capability set: not every draw accepts texture,
  shading, wireframe, rotation or opacity. Grid/point-cloud restrictions already
  demonstrate why one universal list is insufficient.
- `shading: "flat"` and `"lambert"` both select the non-unlit shader. Specify flat
  face normals versus interpolated vertex normals and implement/test that difference.
- The billboard shader uses model-column lengths for width/height, but not a
  visible in-plane rotation. Define sprite roll and diagnose unsupported tilt;
  do not promise all common rotation arguments just because they parse.
- Several enum setters default unknown values rather than diagnosing them.
  Recheck blend/cull/shading and duplicate/structural argument validation as part
  of touched APIs. Runtime-invalid values must not quietly become a default.
- `draw::model` currently enters the per-frame mesh path; mesh GPU entries are
  discarded after each frame. Static model geometry deserves a versioned cache.
  Adjacent matching primitive commands already batch into instanced draws: keep
  that optimization, preserve draw order, and measure before adding a public
  “instances” abstraction.
- Ordinary 2D drawing can retain the previous canvas; the 3D renderer clears each
  frame. Scramble supplies explicit history in both. Document this difference;
  omitting a background does not itself give equivalent trails in both contexts.

These are correctness/completeness findings, not permission for unrelated renames
or silent changes to existing visuals. Separate incompatible fixes into reviewed
changes with a stated version policy.

## 2. Add now: foundation

### A. One practical transform vocabulary

Extend existing `transform::push/pop/identity/translate/scale/rotate_z` to 2D.
Keep `rotate_x/y` 3D-only. `rotate_z(deg: ...)` works naturally for planar rotation
and avoids introducing a second rotation spelling. A `z` argument in 2D errors.

```text
// PROPOSED: these transform calls are currently 3D-only.
transform::push()
transform::translate(x: $WIDTH / 2, y: $HEIGHT / 2)
transform::rotate_z(deg: $TIME_SEC * 20)
for i in 0..12 {
  draw::rect(x: i * 12, y: 0, width: 8, height: 60, color: $COLOR_CORAL)
}
transform::pop()
```

Transforms apply in call order using the existing matrix convention; retain 2D
screen coordinates (+Y down) and 3D world coordinates (+Y up). Document the visual
rotation direction in each context. Reset per render block, maximum stack depth
64, reject underflow, diagnose unbalanced push/pop at block exit. Make clear and
background cover the full canvas independently of the current transform.

### B. Complete the shared draw contracts

Render circle/ellipse/rect/simple planar polygons in the 3D XY plane, with existing
position/rotation and declared appearance options. Preserve existing 2D anchors:
rect uses top-left; circle/ellipse use centre; polygon uses its supplied coordinates.
For world rectangles, recommend a corner anchor with positive extents along local
+X/+Y; document that this is the lower-left corner in an upright world view. Settle
this explicitly before implementation rather than promising identical screen
orientation across opposite Y axes. Do not reinterpret them as centred solids. The existing `plane` stays
an XZ floor; `sprite` stays camera-facing.

Implement thick `line` as geometry, not a reliance on native GPU line width. Use
pixels in 2D and world units in 3D, as the existing contract intends. Cover joins,
near-plane clipping, zero-length segments and transparency. This is foundational
for the polylines and Bézier strokes below.

Implement overlay as an explicit screen-space pass above the world scene, using
the same 2D drawing path, including text/images. Specify whether filters apply
before/after overlay and reproduce that in capture. Start with world draws followed
by one final overlay section per render block; diagnose unsupported interleaving
rather than silently reordering effects. World-space text can remain **later**,
with a compile error explaining that screen-space overlay text is supported.

For `draw::clear/background` in world mode, deliberately define full-frame clear
and colour-background behavior; neither has a meaningful world position. Preserve
`gfx::clear`, with an explicit ordering/conflict rule instead of two inconsistent
ways to clear. The first implementation issue must settle that rule and lock tests.

### C. 2D compositing

Extend `gfx::blend(mode:)` to 2D using the same four mode names. Start each render
block at alpha; changing it affects subsequent draws. Keep transform push/pop
**transform-only**, matching the existing library. Explain that blend is separate
state and reset it explicitly after a local effect. Specify straight versus
premultiplied alpha and compare mixed-alpha output across both renderers. Only add
screen/difference blend modes after their semantics are tested in both contexts.

### D. Motion and scalar helpers

| Proposed expression | Contract |
|---|---|
| `$DELTA_SEC` | Elapsed active time since the preceding frame; float seconds, 0 on init/first frame/resume; sampled once per frame |
| `math::lerp(a:, b:, amount:)` | Linear interpolation; 0→a, 1→b; extrapolates outside 0–1 |
| `math::map(value:, input_min:, input_max:, output_min:, output_max:, clamp: false)` | Remap a range; allow reversed ranges, error for zero input span |
| `math::smoothstep(value:, min:, max:)` | Smooth 0–1 transition; clamp outside range; require max > min |
| `math::wrap(value:, min:, max:)` | Wrap into [min, max), including negative inputs; require max > min |
| `array::length(value:)` | Integer length, including read-only audio arrays; no copying |

Required numeric operands must not default silently to zero. `amount` is the same
interpolation parameter name in math and colour helpers. Existing `a`/`b` operand
names remain consistent with math min/max.

Snapshot existing time getters once per frame and use a monotonic clock; preserve
their documented epoch unless separately approved. Capture reuses that snapshot
without advancing time, events or seeded sampling. `$DELTA_SEC` is not silently
capped: simulations may use `math::min(a: $DELTA_SEC, b: 0.05)` explicitly. A paused
or hidden host must reset the delta baseline when it resumes.

## 3. Add now: creative vocabulary

| Proposed API | Modes | Why it earns a place / initial boundary |
|---|---|---|
| `draw::polyline(points:, closed: false, color:, stroke_width:, line_cap:, line_join:)` | 2D + world 3D + overlay | Waveforms, outlines, trails and wire structures as one draw; joins are continuous, not independent line calls |
| `draw::bezier(points:, color:, stroke_width:)` | 2D + world 3D + overlay | A single cubic curve with exactly four control points; avoid an ambiguous generic `curve` with hidden interpolation rules |
| `draw::arc(x:, y:, radius:, start_deg:, sweep_deg:, color:, stroke_width:)` | 2D + planar 3D + overlay | Rings, gauges, orbital segments; outline only initially, explicit signed sweep |
| `draw::image(asset:, x:, y:, width:, height:, opacity: 1)` | 2D + overlay | Draw an uploaded bitmap/vector without changing rendering context; top-left origin, explicit dimensions; 3D keeps sprite/plane textures |
| `draw::rect(..., corner_radius: 0)` | 2D + planar 3D + overlay | Rounded forms without another primitive; clamp radius to half the smaller dimension |
| Extend polygon with existing stroke options | 2D + planar 3D + overlay | Consistency with circle/rect/ellipse, preserving current fill default |
| `color::mix(a:, b:, amount:)` | CPU + applicable GPU fields | Audio palettes, gradients and fades; interpolate RGBA in documented linear-light RGB, clamp amount to 0–1 |
| `color::radial_gradient(x:, y:, radius:, color_stops:)` | 2D + overlay initially | Halos, vignettes and soft particles; reuse linear-gradient stop representation |
| `math::noise(x:, y: 0, z: 0, seed: 0)` | CPU + GPU fields | Smooth organic motion and terrain from a fixed seeded field; finite inputs, output 0–1 |
| `math::random(seed:, index:)` | CPU + GPU fields | Stateless reproducible sample in [0,1); same seed/index means same result; no hidden global generator advancement |

**Scope controls and contracts:**

- Polyline points are homogeneous `[x,y]` in 2D/overlay, `[x,y,z]` in world 3D;
  no mixed dimensions or implicit point flattening. Minimum two points (three
  when closed); repeated consecutive points are ignored, all-degenerate input
  draws nothing. No holes or self-intersecting filled polygons in the initial
  3D tessellator; diagnose them. Keep transparent draw order deterministic.
- Line defaults: butt caps and bevel joins; support round caps/joins initially.
  Add miter only with a documented miter limit. A world-space stroke is a
  camera-facing ribbon of world-unit width; a lit cylindrical tube is a different
  object, listed below. Do not promise screen-pixel width in 3D yet.
- Bézier uses four points in the same format as polyline. Tessellation is bounded
  and chosen internally from a documented screen-space error tolerance; do not
  expose a `resolution` parameter with unclear units. It is a stroke, not a fill.
- Arc start=0 points along local +X. Signed sweep follows the context's rotation
  convention. Also accept `start_rad`/`sweep_rad`; reject supplying both units for
  the same quantity. Sweep 0 draws nothing; reject magnitude > one full turn.
  Pie sectors and annular filled wedges can follow later without changing arc.
- `draw::image` uses the existing asset preparation/permission pipeline, never a
  URL fetch inside the language. Require a bitmap/vector reference and positive
  width/height. Add source rectangles/fit modes later; avoid hidden natural-size
  layout dependencies in the first version. Rotations use the transform stack.
- Radial gradient requires positive radius; share validated, ordered 0–1 stops
  and clamp outside the outer radius. Planar 3D gradients need an explicit paint
  implementation later; unsupported combinations must compile-error meanwhile.
- Preserve `stroke: true` meaning outline-only. Don't redefine it as “fill plus
  outline.” Simultaneous fill/stroke is useful but needs its own compatibility
  decision; two explicit calls work in the interim. New stroke-only calls use
  `color`, as existing `draw::line` does.
- The two seeded math functions are pure expressions, safe in render/capture and
  GPU fields. Specify the algorithm/version, seed/index integer range and CPU/GPU
  test vectors before coding. Float tolerances are explicit; don't promise
  bit-identical floating noise across GPUs. Stateful streams are not needed now.
- Numeric noise/random is distinct from image noise effects. Supporting math on
  CPU only while silently omitting it from point/grid fields would leave the
  most useful use case incomplete.

### Example: less code for a responsive waveform

```text
// PROPOSED — array::length, math::map and draw::polyline are new.
prop points = []
on_init {
  points = array::filled(count: array::length(value: audio::detect::get_waveform()), value: [0.0, 0.0])
}
on_frame {
  let wave = audio::detect::get_waveform()
  let count = array::length(value: wave)
  // Audio array length is not a permanent language guarantee.
  if array::length(value: points) != count {
    points = array::filled(count: count, value: [0.0, 0.0])
  }
  if count > 1 {
    for i in 0..count {
      points[i][0] = math::map(value: i, input_min: 0, input_max: count - 1, output_min: 0, output_max: $WIDTH)
      points[i][1] = $HEIGHT / 2 + wave[i] * $HEIGHT * 0.3
    }
  }
}
render {
  draw::background(color: $COLOR_BLACK)
  if array::length(value: points) > 1 {
    draw::polyline(points: points, color: $COLOR_CORAL, stroke_width: 3)
  }
}
```

This example is ordinary array-based Visript, not a new callback DSL. It still
updates N samples; a future bulk/GPU path may reduce that cost after profiling.

## 4. Roadmap after the first expansion

| Priority | Capability | Creative payoff | Prerequisite / reason to defer |
|---|---|---|---|
| Next | `draw::tube` and `draw::ribbon` following a 3D point path | Helices, tentacles, audio tunnels, flowing bands | Reuse validated paths; define frame transport/twist, caps, radius/width, normals and bounded tessellation |
| Next | `draw::point_cloud` in 2D; later indexed sprite batches | Dense flat particles, constellations, image fragments | Choose composition with Canvas2D/overlay without changing call order or incurring a full GPU readback; settle logical vs drawing-buffer pixel sizes |
| Next | General path values, clipping and masks | Compound curves, holes, organic filled forms and reveals | Needs typed path values or another explicit representation plus triangulation/fill-rule contracts; don't encode a language inside strings |
| Next | Texture/lit normals/wireframe on `draw::grid` | Terrain, rippling fabric, richer spectrograms | GPU deformation changes normals; define finite-difference cost, seams, alpha and per-field support |
| Next | Stable geometry/model caches and reusable mesh values | More detailed repeated models at consistent frame cost | Profile current uploads; version/invalidate assets and bound GPU memory; no user-managed WebGL handles |
| Next | Undistorted feedback and bloom | Controlled trails and luminous emissive visuals | Reuse scramble's lifecycle/capture handling; specify alpha, effect order, render targets, downsampling and memory budget |
| Next | Text alignment, baseline, measurement and cached world text | Labels, kinetic typography, readable 3D annotation | Overlay first; font readiness, atlas caching and capture consistency; no per-frame rasterization of unchanged text |
| Later | Vector helpers, easing families and palette sampling | More reusable motion and colour logic | Establish typed vector representation/return values before adding overlapping tuple conventions |
| Later | Extrude/lathe/SVG paths; capsules, regular polygons, stars, sectors | Sculptural geometry and convenience shapes | General path/geometry foundation; convenience shapes can already be composed, prioritize demonstrated demand |
| Later | PBR/material values, emissive, fog, spotlights, shadows | Richer depth and surface appearance | Define colour management/material ownership and lighting cost; unlit + Lambert stay simple defaults |
| Later | Model materials, skinning, morph targets and animation | Character/model-driven visuals | Asset pipeline retains geometry today; requires scene/animation contract and bounded decode/GPU resources |
| Later | Layers/render targets, custom shader/filter expressions | Multi-pass feedback, displacement, procedural materials | Resource lifetime, validation, failure isolation and capture parity need design; not a raw shader escape hatch by default |
| Later | Persistent GPU simulation and particle systems | Large evolving fluids/agents/physics | State ownership, reset/replay, deterministic testing and fixed-step updates; procedural point positions are not persistent simulation |
| Separate track | MIDI/gamepad/multitouch | More live control | Already [VIS-110](https://linear.app/visamp/issue/VIS-110); do not couple drawing delivery to it |

## 5. Keep it grokable

1. **One operation, one canonical spelling.** Extend `rect`, `line`, `transform`
   and `gfx` where semantics match; don't introduce `rect2d`, `line3d`, a parallel
   `shape` library or aliases for every familiar library spelling.
2. **One data shape per concept.** Existing nested arrays for point lists; reuse
   asset references, colour values and gradient stops. No implicit string parsers,
   user-managed buffers or object scene graph for the first expansion.
3. **State only where it helps.** Explicit appearance per draw; a bounded transform
   stack and clearly scoped render state. No global `fill()` / `stroke()` style
   stack that helpers can accidentally leak.
4. **Visible units and predictable defaults.** Pixels versus world units, alpha,
   radians/degrees, size/anchor/pivot, line winding and sweep all documented. Keep
   `segments`, `subdivisions`, and existing sphere `resolution` distinct; they
   measure different things, so renaming them all is not simplification.
5. **Share a capability registry.** Extend signature metadata with types, defaults,
   ranges, enums, lifecycle/context/overlay/CPU/GPU availability. Generate reference
   tables, editor assistance and model-facing API reference from it. Keep worked
   examples hand-authored and compiled; models need the same truth as humans.
6. **Errors at the right level.** Compile errors for unsupported literal usage;
   located runtime errors for computed invalid values. Never accept a feature
   solely to fail every frame when a renderer capability is already known.

## 6. Real-time implementation requirements

- Budget vertices/segments/commands, array traversal, tessellation and retained
  bytes—not merely number of draw calls. Existing 3D draw/triangle and point/grid
  limits are a starting point; 2D paths also need explicit limits.
- Cache bounded geometry by topology and relevant parameters. Avoid rebuilding
  reusable curves, textures, glyphs or models every frame; define eviction and
  asset invalidation. Animated coordinates need a deliberate dynamic path.
- Preserve alpha ordering. Existing adjacent-command instancing is useful; sorting
  all matching shapes together can change translucent pictures.
- Measure CPU frame time, GPU time where available, uploads, allocations and memory
  on agreed desktop **and** lower-power/mobile baselines. No unmeasured “60 FPS”
  promise. Record viewport/DPR/count/quality with each benchmark.
- Include cancellation/error paths, context loss, resize, source switching and
  fixed-size thumbnail capture. A feature is incomplete if its live render works
  but capture or reactivation differs.

## 7. Suggested implementation tickets and acceptance gates

Create/scope implementation tickets after owner review of this proposal. Dependencies
are explicit; these are proposed work packages, not claimed active work:

1. **Capability audit and truthful docs/diagnostics:** support matrix verified against
   runtime; compile checks for deferred combinations; enum/conflict/type cases.
2. **Timing and scalar helpers:** frame snapshots, resume/capture behavior, helper
   edge cases and CPU/GPU parity; array length on ordinary and audio arrays.
3. **2D transforms and blend:** nested transform fixture, underflow/unbalanced errors,
   whole-canvas clear, blend/alpha reference images in both modes.
4. **3D planar shapes, thick lines and overlay:** concave simple polygon, thick line
   near the camera, world+screen text/image composition; never change accepted
   support without a documented compatibility decision.
5. **Paths and simple drawing additions:** connected waveform, cubic curve, signed
   arcs and rounded rectangles in supported contexts; tessellation caps and no
   per-segment command explosion.
6. **Images and paint:** prepared asset in 2D/overlay, premultiplied-alpha edges,
   radial gradients and linear-light colour mixing; thumbnail parity.
7. **Seeded fields:** fixed reproducible tests, integer seed/index validation,
   smooth noise animation in CPU and GPU point/grid fields; capture never changes
   samples. This can follow 2 independently of 3–6.

Each ticket must include native/WASM validator parity, signatures and diagnostics,
CPU and relevant GPU evaluation, editor/AI references, docs and sample visuals.
Provide live-test fixtures as with input: a transform mandala, waveform/curve,
arc meter, transparent image collage, world-space line sculpture with overlay,
and seeded particle/grid field. Defer all stored-source work until an approved
change actually needs it; this review makes no language or database changes.

## Evidence and design references

Repository audit (implementation at the revision above):

- [Signatures and availability](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/builtins.rs),
  [grammar](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/visript.pest)
- [Runtime: scene calls, record_draw, Canvas2D, time values](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/interpreter.rs)
- [Renderer: billboards, lighting, geometry lifetime](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/renderer.rs),
  [scene batching and limits](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/scene.rs)
- [GPU field compiler](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/points.rs),
  [feedback](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/feedback.rs),
  [clock](https://github.com/fergalhanley/visamp-2/blob/93ad44c/packages/engine/src/utils.rs)

External comparisons inform these recommendations, not Visript's existing contract:

- [p5 noise](https://p5js.org/reference/p5/noise/) illustrates smooth spatial/time
  variation; Visript should use explicit deterministic seeds without hidden global
  state. [p5 deltaTime](https://p5js.org/reference/p5/deltaTime/) illustrates the
  value of exposing frame duration; this proposal uses seconds.
- [Three.js LineBasicMaterial](https://threejs.org/docs/pages/LineBasicMaterial.html)
  documents fixed-width native line limitations; triangle-based thick strokes
  avoid relying on portable wide-line support.
- [Three.js InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
  describes repeated-geometry batching benefits. Visript already has internal
  instancing; the recommendation is to preserve it, not add it from scratch.
