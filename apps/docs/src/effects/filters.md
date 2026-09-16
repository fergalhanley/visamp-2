# Canvas Filters

Filter effects post-process the completed canvas frame. They work in both
`context 2d` and `context 3d`, compose in statement order, and reset
automatically at the beginning of the next frame.

```visript
render {
  effect::filter::blur(radius: 4.0)
  effect::filter::brightness(amount: 1.2)
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: 80.0,
    color: $COLOR_TURQUOISE
  )
}
```

The available filters are:

| Call | Argument | Default | Meaning |
|---|---|---:|---|
| `effect::filter::blur` | `radius` | `0.0` | Blur radius in pixels; negative values clamp to zero |
| `effect::filter::brightness` | `amount` | `1.0` | `1.0` leaves brightness unchanged; values above `1.0` brighten |
| `effect::filter::contrast` | `amount` | `1.0` | `1.0` leaves contrast unchanged |
| `effect::filter::grayscale` | `amount` | `1.0` | Mix from unchanged (`0.0`) to grayscale (`1.0`) |
| `effect::filter::hue_rotate` | `deg` or `rad` | `0.0` | Rotate hues by an angle |
| `effect::filter::invert` | `amount` | `1.0` | Mix from unchanged (`0.0`) to inverted (`1.0`) |
| `effect::filter::opacity` | `amount` | `1.0` | Mix from transparent (`0.0`) to unchanged (`1.0`) |
| `effect::filter::saturate` | `amount` | `1.0` | `1.0` leaves saturation unchanged; values above `1.0` intensify colours |
| `effect::filter::sepia` | `amount` | `1.0` | Mix from unchanged (`0.0`) to sepia (`1.0`) |

The bounded `amount` filters clamp values to `0.0..1.0`. Brightness, contrast,
and saturate accept values above `1.0`. Multiple calls combine:

```visript
effect::filter::contrast(amount: 1.4)
effect::filter::sepia(amount: 0.8)
```

Filters run in the engine on the GPU, after the completed scene (including a
3D overlay) and scramble/feedback. The final canvas contains the filtered pixels,
so playback and thumbnail capture use the same implementation. Filtered pixels
never feed back into accumulated drawing or scramble history. Their position
among drawing calls does not limit which primitives they affect.

Colours use sRGB filter math and premultiplied alpha. Blur `radius` is the Gaussian
standard deviation in canvas pixels. Large blurs use a downsampled approximation
to keep rendering practical. Blur samples beyond the canvas are transparent and
output is clipped to the canvas bounds.

A frame supports up to 32 combined filter and [whole-frame effect](frame-effects.md) calls. Filtered scripts require WebGL2 in both
contexts. Post-processing surfaces are limited to 16,777,216 pixels and the GPU's
maximum texture dimensions. Invalid non-finite values produce a runtime error.

Thumbnail capture renders a fresh frame at its capture resolution, with filters
baked in. It does not include accumulated drawing or scramble history from live
playback. No script changes are needed when moving from the former CSS filters.
