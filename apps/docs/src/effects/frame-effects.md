# Whole-frame effects

Available in **Visript 5.2**. These `effect::` statements process the completed
frame in both `context 2d` and `context 3d`, including the final overlay.

```visript
render {
  draw::background(color: $COLOR_BLACK)
  draw::circle(x: $WIDTH * 0.7, y: $HEIGHT / 2, radius: 100, color: $COLOR_CORAL)
  effect::kaleidoscope(segments: 8, branches: 3)
  effect::bloom(threshold: 0.5, intensity: 1.5, radius: 12)
}
```

## Shared rules

- Effects and [filters](filters.md) run in **call order**, after scene/overlay and
  [scramble feedback](scramble.md). Their position between drawing calls does not
  limit which primitives they affect. Effects reset each frame and never enter
  accumulated drawing or scramble history.
- Available only in `render` (and helpers called from it), including after
  `gfx::overlay(enabled: true)`. All effects use WebGL2, including in 2D.
- Positions and lengths use **canvas pixels**, with the origin at the top left.
  `x`/`y` default to the canvas centre. `deg`/`rad` are alternatives; giving both
  is an error. Positive orientation angles turn clockwise on the screen.
- Positive dimensions must be at least 0.001 pixels; gaps must be non-negative. New effect numbers
  must be finite with magnitude at most 1,000,000, with tighter limits below.
  Out-of-range values produce errors rather than silently clamping. Counts
  require integer values: `8` is valid, `8.0` is not. Use integer division (`\`)
  when deriving a count from a changing value.
- There is a combined budget of 32 effects/filters per frame (excluding scramble).
  Existing surface limits and capture semantics in [Canvas Filters](filters.md)
  apply. Distortion samples outside the canvas are transparent, clipped to the
  output bounds. Pixelation's partial edge cells sample the nearest source pixel.
- Colours are processed in sRGB with premultiplied alpha. Gap colours default to
  transparent; the player background and opaque-black thumbnail background may
  make transparent gaps appear black.

## Kaleidoscope

```visript
effect::kaleidoscope(x: $WIDTH / 2, y: $HEIGHT / 2, segments: 8, branches: 1, deg: 0)
```

`segments` is an integer from **2 to 64**, default **8**. Each of the equal angular
segments contains a mirrored pair of half-wedges. `branches` is an integer from
**1 to 6**, default **1**. Orientation defaults to zero.

With one branch, only the angular folds apply. Higher values close the source
half-wedge into a triangle, then repeatedly reflect across its outer chord and
wedge edges. The triangle's radial extent is the distance from the centre to the
furthest canvas corner divided by `branches`. This creates smaller repeated
triangular reflections while preserving the selected angular symmetry. Branches
are a spatial subdivision control, not additional frame-history passes.

## Pixelation

Each cell takes its colour from the **centre of the source cell**; it does not
average all pixels in the cell. `gap` is edge-to-edge spacing, default `0`;
`gap_color` defaults to transparent. Shape dimensions exclude the gap.

| Call | Dimensions and defaults | Layout |
| --- | --- | --- |
| `effect::pixelate(size: 10)` | Square width `size` | Square grid |
| `effect::pixelate_rect(width: 10, height: 10)` | Rectangle dimensions | Rectangular grid |
| `effect::pixelate_circle(size: 10)` | Circle diameter | Circular dots in square cells |
| `effect::pixelate_triangle(side_length: 10)` | Equilateral side length | Alternating triangles, tiles fully at zero gap |
| `effect::pixelate_pentagon(side_length: 10)` | Regular pentagon side length | Shapes in square cells; spaces remain at zero gap |
| `effect::pixelate_hexagon(side_length: 10)` | Regular hexagon side length | Honeycomb, tiles fully at zero gap |
| `effect::pixelate_pentagram(size: 10)` | Five-point star outer diameter | Filled stars in square cells |
| `effect::pixelate_hexagram(size: 10)` | Six-point star outer diameter | Filled stars in square cells |

All accept `gap` and `gap_color`. Rectangles, triangles, polygons and stars also
accept `deg` or `rad`, default zero, rotating the **entire cell grid about the
canvas centre**. Circles and the simple square call have no orientation argument.
Pentagrams have the regular five-point star inner radius; hexagrams use the
outline of two overlapping equilateral triangles.

```visript
effect::pixelate_triangle(side_length: 24, deg: 15, gap: 3,
  gap_color: color::rgb(r: 0.02, g: 0.03, b: 0.08))
```

## Distortion and symmetry

| Call | Parameters and behaviour |
| --- | --- |
| `effect::swirl()` | `x`, `y`, positive `radius` (default half the smaller canvas dimension), `deg`/`rad` (default 0). Rotation is strongest at the centre and smoothly falls to zero at the radius. Pixels outside remain unchanged. Signed angles and multiple turns are preserved. |
| `effect::mirror(axis: "x")` | `axis`: `"x"` (default), `"y"`, or `"both"`. X copies the left half across to the right; Y copies the top half to the bottom. Both copies the top-left quadrant. |
| `effect::ripple()` | `x`, `y`, positive `wavelength` (default 40 pixels), signed `amplitude` (default 8 pixels), `phase` (default 0 **turns**). A radial sine displacement; centre displacement smoothly falls to zero. Increase phase to animate outward wave fronts. |
| `effect::displace(map: asset::bitmap(id: "…"))` | Required bitmap `map`; signed `amount` (default 20 pixels). The bitmap stretches across the canvas. Red controls X, green Y: 0 maps to −amount, 0.5 to zero, 1 to +amount. Map alpha attenuates displacement; fully transparent map pixels are neutral. |

Swirl's positive angle visibly rotates source content clockwise. Displacement and
ripple offsets describe **where the output reads the source**: a positive X offset
reads to the right and therefore moves source features left. Bitmap maps follow
the normal asset preload/access rules; a missing map reports a located error.

## Colour, light and screen effects

| Call | Parameters and behaviour |
| --- | --- |
| `effect::posterize(levels: 6)` | Integer `levels` 2–256, default 6, independently quantizes each RGB channel. Alpha stays unchanged. |
| `effect::chromatic_aberration(amount: 5, deg: 0)` | Signed pixel offset (default 5), orientation `deg`/`rad` (default 0). Red shifts along the angle, blue opposite, green stays in place. Alpha expands to cover shifted channels. |
| `effect::vignette(amount: 0.5)` | `x`, `y`, positive `radius` (default half the smaller dimension), `softness` 0.001–1 (default 0.5), `amount` 0–1 (default 0.5). Darkens RGB from the inner radius `radius * (1 - softness)` to the outer radius; preserves alpha. |
| `effect::scanlines(spacing: 4, amount: 0.3)` | Positive `spacing` in pixels (default 4); `amount` 0–1 (default 0.3); `deg`/`rad` (default 0, horizontal). Smooth repeating dark lines; preserves alpha. |
| `effect::bloom(threshold: 0.8, intensity: 1.2, radius: 12)` | `threshold` 0–1, `intensity` 0–64, Gaussian `radius` 0–4096 pixels. Extracts brightness above threshold, blurs it, then adds the glow over the unchanged source. |

Bloom measures brightness from the largest premultiplied RGB channel. Its output
is clamped to display range; it is not an HDR lighting pipeline. It can spread
alpha into transparent areas. Zero intensity is an identity operation; zero radius
adds the extracted highlights without spatial spread. Large radii use the same
Gaussian approximation as `effect::filter::blur`.

All effects are baked into the final canvas and thumbnails. Large blur/bloom and
long chains require more GPU work; reuse simpler combinations on smaller devices.

<!-- internal:start -->
See the [21-script test pack](https://github.com/fergalhanley/visamp-2/tree/develop/packages/engine/examples/effects)
for individual effects, editable controls, a 3D mosaic and feedback combinations.

<!-- internal:end -->
