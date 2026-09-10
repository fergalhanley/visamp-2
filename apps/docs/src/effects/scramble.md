# Scramble

`effect::scramble` shifts colour channels across the completed image. With a
transparent refresh colour it retains the **scrambled output** from the previous
frame, producing distorted trails. The same call works in `context 2d` and
`context 3d`.

```vdsl
effect::scramble(type: 1, refresh_color: color::rgb(transparent: 0.93))
```

| Parameter | Default | Meaning |
|---|---|---|
| `type` | `1` | Integer from `1` to `40`; other values cause a runtime error |
| `refresh_color` | `$COLOR_BLACK` | Existing DSL colour, including its transparency |

The effect applies once after drawing. Its position among drawing calls does
not matter; if multiple calls execute, the last one supplies that frame's
settings. Omitting the call disables the effect for that frame and discards
its history. Changing the type while enabled keeps the existing trails.

## Refresh and backgrounds

Each frame overlays the refresh colour on history, draws the current scene over
it, scrambles the combined image, then displays and retains the result.

| Refresh colour | Behaviour |
|---|---|
| Omitted, or `$COLOR_BLACK` | Opaque black replaces history; no trails |
| `color::rgb(transparent: 0.93)` | Trails fade towards black |
| `color::rgb(b: 0.2, transparent: 0.93)` | Trails fade towards dark blue |
| `color::rgb(transparent: 1.0)` | No automatic fading |

`transparent: 0.93` means **7% opacity**, using the existing colour API. That
opacity is applied in 60 Hz refresh steps accumulated from elapsed time so fade
duration stays consistent at different frame rates. A faster renderer can draw
between refresh steps; a slower one applies the elapsed steps together. This
preserves the original Canvas2D byte rounding without making it happen more
often at higher frame rates. Displacement still happens
once per rendered frame, so motion can differ at different frame rates.

With scramble, the current scene starts transparent. Explicit
`draw::background` (2D) and `gfx::clear` (3D) colours are still honoured as part
of that scene. **An explicit opaque background hides previous trails.** Remove
it when using `refresh_color` to control fading. `draw::clear()` clears only
the current 2D scene, not retained history.

History starts transparent and resets when a visual is loaded, the canvas
resizes, the graphics context is recreated, or the effect is re-enabled.
3D depth is fresh every frame: trails are images, not geometry that can occlude
new objects. CSS `effect::filter::*` effects apply afterwards for display and
are not included in the retained history.

## Types

Types 1–17 preserve the original shift filter's numbering and byte addressing.
Offsets refer to **RGBA bytes**, so they can select a different colour channel
and cross pixel or row boundaries. The source base is one row minus one pixel
ahead of the destination. The initial `width - 1` pixels and the excluded
bottom rows remain unchanged by the scramble step.

| Type | R offset | G offset | B offset | A offset | Bottom rows excluded |
|---|---:|---:|---:|---:|---:|
| 1 | -100 | 100 | 0 | 3 | 24 |
| 2 | 4 | 1 | -2 | 3 | 1 |
| 3 | 4 | 5 | 6 | 7 | 1 |
| 4 | 6 | 4 | 5 | 7 | 1 |
| 5 | 2 | 0 | 1 | 3 | 1 |
| 6 | 55 | 1 | 77 | 36 | 20 |
| 7 | 20 | 21 | 22 | 23 | 11 |
| 8 | -23 | -22 | -21 | -20 | 1 |
| 9 | -24 | -23 | -22 | -21 | 1 |
| 10 | 20 | 1 | -22 | 3 | 5 |
| 11 | 4 | 21 | -22 | 3 | 5 |
| 12 | 27 | -29 | 44 | 2 | 12 |
| 13 | -9 | -36 | 11 | 20 | 12 |
| 14 | 32 | 48 | -40 | 43 | 12 |
| 15 | -47 | 22 | 19 | 26 | 12 |
| 16 | -72 | -33 | -5 | -100 | 12 |
| 17 | 49 | -88 | 52 | 31 | 12 |

Types 18–40 affect the whole image, clamping source coordinates at its edges.
Spatial effects move alpha along with colour; channel separation and cycling
keep alpha in place. All settings are fixed per type. With transparent refresh,
these distortions accumulate into waves, spirals and fractured trails.

| Type | Behaviour |
|---|---|
| 18 | RGB separation: red samples 3 pixels right, blue 3 pixels left; green and alpha stay in place |
| 19 | Alternating rows sample 4 pixels right or left |
| 20 | Alternating 16×16 tiles sample 4 pixels diagonally down-right or up-left |
| 21 | **Vertical RGB split:** red samples 3 pixels below, blue 3 pixels above |
| 22 | **RGB prism:** separates red, green and blue in three directions |
| 23 | **Chromatic zoom:** red expands and blue contracts around unchanged green |
| 24 | **Channel carousel:** cycles green → red, blue → green, red → blue |
| 25 | **Horizontal wave:** shifts rows sideways along a sine wave |
| 26 | **Vertical wave:** shifts columns up and down along a sine wave |
| 27 | **Cross waves:** combines horizontal and vertical waves |
| 28 | **Expansion:** zooms the image outwards from its centre |
| 29 | **Contraction:** shrinks the image towards its centre |
| 30 | **Clockwise swirl:** rotates clockwise, faster near the centre |
| 31 | **Counterclockwise swirl:** rotates counterclockwise, faster near the centre |
| 32 | **Radial ripple:** concentric waves push pixels towards and away from the centre |
| 33 | **Pinch lens:** pulls the central image inwards |
| 34 | **Bulge lens:** enlarges the central image |
| 35 | **Tile rotation:** rotates alternating 16×16 tiles in opposite quarter-turns |
| 36 | **Tile mirrors:** alternates horizontal and vertical reflections in 16×16 tiles |
| 37 | **Mosaic:** samples one colour per 8×8 block |
| 38 | **Scanline slip:** shifts each 8-pixel-high band by a different fixed amount |
| 39 | **Block scatter:** shifts each 16×16 tile by a deterministic offset |
| 40 | **Four-way split:** pushes each quadrant diagonally away from the centre |

For flowing trails, try types 25–34 with `transparent: 0.93`. Types 35–39
produce more fragmented, glitch-like patterns. Types 28 and 29 are gradual
zooms; a transparent refresh makes their repeated expansion or contraction
more visible.

## Moving 2D shape

```vdsl
context 2d

render {
  effect::scramble(type: 1, refresh_color: color::rgb(transparent: 0.93))
  draw::circle(
    x: $WIDTH / 2.0 + math::sin(radians: $TIME_SEC) * $WIDTH * 0.3,
    y: $HEIGHT / 2.0,
    radius: 24.0,
    color: $COLOR_TURQUOISE
  )
}
```

## Moving 3D scene

```vdsl
context 3d

render {
  effect::scramble(type: 3, refresh_color: color::rgb(b: 0.08, transparent: 0.93))
  draw::cube(
    x: math::sin(radians: $TIME_SEC) * 3.0,
    rot_x: $TIME_SEC * 25.0,
    rot_y: $TIME_SEC * 40.0,
    size: 1.5,
    color: $COLOR_TURQUOISE
  )
  draw::sphere(x: 0.5, z: 0.4, radius: 0.65, color: $COLOR_ORANGE)
}
```

Scramble uses WebGL2 in both contexts. A 2D visual still draws with Canvas2D;
the completed scene feeds the GPU effect directly. There is no per-frame CPU
pixel readback. Fullscreen resolution increases the memory and bandwidth needed
by the scene, composition and history buffers.
