# Creative drawing tools (5.1)

Visript 5.1 adds connected paths, images, shared 2D transforms, planar 3D
shapes, screen overlays, and motion/colour helpers. Existing `.viscript` files
keep their extension. No stored-script migration is required.

## Availability

| Operation | 2D / 3D overlay | World 3D |
|---|---|---|
| `circle`, `ellipse`, `rect`, `polygon` | Pixel coordinates; gradients allowed | XY plane; solid colours/textures; no gradients |
| `line`, `polyline`, `bezier`, `arc` | Pixel-width stroke | Camera-facing triangle ribbon; world-unit width |
| `text`, `image` | Supported | Use the final overlay section |
| `clear`, `background` | Whole canvas, unaffected by transforms | Full-frame clear colour; last clear/background/`gfx::clear` wins |
| `transform::push/pop/identity/translate/scale/rotate_z` | Supported; no `z` | Supported |
| `transform::rotate_x/rotate_y` | Unavailable | Supported |
| `gfx::blend` | `alpha`, `additive`, `multiply`, `none` | Existing WebGL blend modes |

World rectangles keep their corner anchor: positive width/height extend along
local +X/+Y (lower-left in an upright world view). Circles/ellipses use their
centre; polygons use supplied XY coordinates, with optional `z`. The existing
`plane` is an XZ floor; `sprite` faces the camera. Planar shapes keep existing
numeric defaults (e.g. circle radius 50); specify world sizes explicitly.

The 2D canvas can retain earlier frames when not cleared. World 3D clears every
frame. Use scramble for explicit feedback. Alpha draw order is preserved.

### Transforms and blending

```visript
render {
  draw::background(color: $COLOR_BLACK)
  transform::push()
  transform::translate(x: $WIDTH / 2, y: $HEIGHT / 2)
  transform::rotate_z(deg: $TIME_SEC * 20)
  draw::rect(x: -40, y: -40, width: 80, height: 80, corner_radius: 12, color: $COLOR_CORAL)
  transform::pop()
}
```

Transforms multiply in call order. Positive Z rotation appears clockwise in
2D (+Y down), counterclockwise in an upright world XY view (+Y up).
`scale(all:)` conflicts with axis scales; `deg` and `rad` are alternatives.
The stack holds only transforms, has at most 64 entries including the identity,
and must balance. Transform and blend state reset each render block.

2D uses Canvas `source-over`, `lighter`, `multiply`, and `copy` respectively.
`none` therefore replaces the canvas image for each draw, including transparency
outside the source shape. WebGL `none` disables blending for covered fragments;
it does not erase uncovered pixels. WebGL multiply uses destination-colour
multiplication; transparent results are not interchangeable with Canvas multiply.
Use alpha/additive for portable translucent composition. Uploaded asset pixels
are straight-alpha RGBA; the engine handles render-target premultiplication.

### Final overlay

```visript
context 3d
render {
  draw::cube(rotation_y_deg: $TIME_SEC * 20, color: $COLOR_CORAL)
  gfx::overlay(enabled: true)
  draw::text(content: "Hello", x: 20, y: 40, size: 24, color: $COLOR_WHITE)
}
```

Use one final overlay section. World drawing cannot follow it. Overlay has its
own 2D transform stack, starts in alpha blend, and ignores world depth/culling.
Filters and scramble process the completed world-plus-overlay image. Captures
render the overlay at capture dimensions with the same frame snapshot.
World-space text, world images, overlay solids and planar world gradients produce
explicit errors. Dynamic overlay state is checked at runtime.

## Connected strokes

```visript
draw::polyline(points: [[20,20],[80,100],[160,30]], closed: false,
  color: $COLOR_CORAL, stroke_width: 3, line_cap: "round", line_join: "round")
draw::bezier(points: [[20,100],[80,20],[140,180],[200,100]],
  color: $COLOR_WHITE, stroke_width: 2)
draw::arc(x: 100, y: 100, radius: 60, start_deg: 0, sweep_deg: -270,
  color: $COLOR_CORAL, stroke_width: 4)
```

- Polyline: at least two `[x,y]` points, three when `closed: true`. World polylines
  and Béziers require `[x,y,z]`. Repeated consecutive points are ignored.
- Bézier: exactly four control points, cubic, stroke only. Adaptive subdivision
  targets 0.25 drawing-buffer pixels using projected control-point second
  differences; depth 12 / 4096 samples are hard bounds, so this is a quality
  target rather than an absolute error guarantee near projection singularities.
- Arc: required positive radius and signed sweep; optional start defaults to 0
  along +X. `start_rad` / `sweep_rad` substitute for degree arguments; never both
  units for one quantity. Zero sweep draws nothing; magnitude cannot exceed 360°.
- Caps: `butt` (default), `round`, `square`. Joins: `bevel` (default), `round`.
  No miter option. Width must be positive. World strokes are unlit ribbons, not
  cylinders; they accept colour/opacity/rotation, not texture/shading/wireframe.
  Segments aimed exactly down the view direction collapse to zero screen length.
- `polygon` now accepts `stroke`, `stroke_width`, `stroke_color`, `line_cap`,
  `line_join`. `stroke: true` still means outline only. Filled world polygons
  must be simple, without holes, crossings or touching nonadjacent edges.
- `rect(corner_radius:)`: nonnegative; clamped to half the smaller dimension.

## Images and paint

```visript
draw::image(asset: asset::bitmap(id: "YOUR-ASSET-ID"), x: 20, y: 20,
  width: 160, height: 120, opacity: 1)
```

Images accept bitmap/vector references from the existing asset library, with
required positive width/height. Position is top-left; rotate using transforms.
Opacity is 0–1. Assets use the host's existing preload/permission pipeline.
The decoded Canvas image cache is bounded to 32 entries / 64 MiB.

`color::mix(a:, b:, amount:)` mixes RGB in **linear light** (sRGB decode, interpolate,
encode), and alpha linearly. Amount clamps to 0–1. Half black/white is about
0.735 sRGB, not 0.5. Available in CPU expressions and point/grid colour fields.

```visript
let glow = color::radial_gradient(x: 100, y: 100, radius: 80,
  color_stops: [[0, $COLOR_WHITE], [1, color::rgb(r: 0, g: 0, b: 0, a: 0)]])
draw::circle(x: 100, y: 100, radius: 80, gradient: glow)
```

Radial gradients are concentric, with inner radius 0. Radius must be positive,
coordinates finite, and 2–1024 `[offset, colour]` stops ordered within 0–1.
Outside the final radius the final colour continues. Gradients are 2D/overlay only.

## Motion and collection helpers

| Expression | Contract |
|---|---|
| `math::lerp(a:, b:, amount:)` | Linear interpolation; extrapolates beyond 0–1 |
| `math::map(value:, input_min:, input_max:, output_min:, output_max:, clamp: false)` | Reversed ranges allowed; zero input span errors |
| `math::wrap(value:, min:, max:)` | Wrap into [min,max), including negative values; max > min |
| `math::smoothstep(value:, min:, max:)` | Smooth, clamped 0–1; max > min |
| `array::length(value:)` | Integer array length, including audio arrays; does not copy an array variable |
| `math::random(seed:, index:)` | Pure, reproducible sample in [0,1); no mutable generator |
| `math::noise(x:, y: 0, z: 0, seed: 0)` | Smooth trilinear value noise in 0–1 |

All numeric inputs must be finite. Seeds/indices are whole numbers 0–16777215;
noise coordinates are within ±1000000. Noise uses cubic smoothstep between hashed
integer lattice corners. Algorithm version 1: the fixed 32-bit mixer uses
`0x7feb352d` and `0x846ca68b`, taking its top 24 bits. The engine's
`creative_math.rs` and `creative_math.glsl` define matching CPU/GPU implementations.
Random samples match exactly at representable inputs; allow 1e-5 floating tolerance
for noise at moderate coordinates. GPU precision loses subcell detail at large
coordinates. There is no clock input unless the script supplies one.

These helpers work in point/grid fields. A computed invalid per-vertex GPU value
becomes non-finite and is culled under the existing field rules; frame-constant
invalid values produce located runtime errors. `map`'s `clamp` must be frame-constant.
See [system values](../programming/system-values.md) for `$DELTA_SEC`, `$FRAME_INDEX`
and local calendar values. Capturing does not advance their snapshot or randomness.

## Budgets and compatibility

Input paths: 4096 points. Generated 2D paths: 65536 samples per render. Filled
world polygons: 1024 vertices. Each stroke mesh: 65536 vertices. Generated meshes:
1000000 vertices per frame, within existing draw/triangle/execution budgets.
Overlay: 8192 calls / 262144 retained values. Budget failures are explicit errors.
Self-crossing strokes may naturally overlap; avoid hairpin turns tighter than
half their width when transparent overlap matters.

`flat` shading now uses face normals; `lambert` uses interpolated normals.
Billboard sprites support Z roll; direct X/Y tilt arguments error. Parent transforms
still affect their position/scale. Unknown blend/cull/shading strings, duplicate
arguments, and unsupported combinations now error instead of silently defaulting.

The [design review](../design/drawing-expansion.md) records the original audit.
Deferred geometry, effects and rendering work is tracked in
[VIS-113](https://linear.app/visamp/issue/VIS-113).
