# Canvas Filters

Filter effects post-process the completed canvas frame. They work in both
`context 2d` and `context 3d`, compose in statement order, and reset
automatically at the beginning of the next frame.

```vdsl
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

```vdsl
effect::filter::contrast(amount: 1.4)
effect::filter::sepia(amount: 0.8)
```

The player applies these functions as a CSS `filter` on the canvas. This keeps
filtering out of the per-primitive drawing path and lets the browser composite
the effect efficiently for both Canvas 2D and WebGL. As full-frame effects,
their position among drawing calls does not limit which primitives they affect.
