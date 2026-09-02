# Color Constructors

Color constructors let you create custom colors using RGB or HSL values.

## color::rgb()

Create a color from red, green, and blue components.

```
color::rgb(r: 1.0, g: 0.5, b: 0.0, transparent: 0.2)
```

### Parameters

All parameters are **optional** and default to `0.0` — but a *misspelled* one
is an error, not a silent zero:

```
color::rgb(red: 1.0)
// error: color::rgb: unknown argument 'red' (it is 'r' now)
```

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `r` | Float | 0.0 - 1.0 | 0.0 | Red intensity |
| `g` | Float | 0.0 - 1.0 | 0.0 | Green intensity |
| `b` | Float | 0.0 - 1.0 | 0.0 | Blue intensity |
| `transparent` | Float | 0.0 - 1.0 | 0.0 | Opacity (0 = fully opaque, 1 = fully transparent) |

### Examples

```
// Pure red
color::rgb(r: 1.0)

// Custom purple
color::rgb(r: 0.6, b: 0.8)

// Semi-transparent green
color::rgb(g: 1.0, transparent: 0.5)

// Dark gray
color::rgb(r: 0.3, g: 0.3, b: 0.3)
```

## color::hsl()

Create a color from hue, saturation, and lightness.

```
color::hsl(h: 0.5, s: 0.8, l: 0.5, transparent: 0.0)
```

### Parameters

All parameters are **optional** and default to `0.0` — but a *misspelled* one
is an error, not a silent zero:

```
color::hsl(hue: 0.5)
// error: color::hsl: unknown argument 'hue' (it is 'h' now)
```

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `h` | Float | 0.0 - 1.0 | 0.0 | Color angle (wraps, 0 = red) |
| `s` | Float | 0.0 - 1.0 | 0.0 | Color intensity (0 = gray, 1 = vivid) |
| `l` | Float | 0.0 - 1.0 | 0.0 | Brightness (0 = black, 0.5 = color, 1 = white) |
| `transparent` | Float | 0.0 - 1.0 | 0.0 | Opacity |

### Hue Wheel

```
0.00 = Red
0.17 = Yellow
0.33 = Green
0.50 = Cyan
0.66 = Blue
0.83 = Magenta
1.00 = Red (wraps)
```

### Examples

```
// Vivid red
color::hsl(h: 0.0, s: 1.0, l: 0.5)

// Pastel blue
color::hsl(h: 0.6, s: 0.5, l: 0.7)

// Rainbow generator
fn rainbow_color(position) {
  return color::hsl(h: position, s: 1.0, l: 0.5)
}
```

## color::linear_gradient()

Create a gradient that fades between colors along a line.

```
color::linear_gradient(
  x0: 0.0, y0: 0.0,
  x1: 200.0, y1: 0.0,
  color_stops: [
    [0.0, color::rgb(r: 1.0)],
    [0.5, color::rgb(g: 1.0)],
    [1.0, color::rgb(b: 1.0)]
  ]
)
```

Unlike `color::rgb()`/`color::hsl()`, this doesn't build a `Color` — it builds
a gradient, which goes in a primitive's **`gradient`** argument rather than
its `color` argument. See [Using a Gradient](#using-a-gradient) below.

### Parameters

All parameters are **optional** and default to `0.0` (or an empty gradient
for `color_stops`):

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x0` | Float | 0.0 | Start point X, in the same coordinates as the shape it's applied to |
| `y0` | Float | 0.0 | Start point Y |
| `x1` | Float | 0.0 | End point X |
| `y1` | Float | 0.0 | End point Y |
| `color_stops` | Array | `[]` | Array of `[offset, color]` pairs |

Each color stop is a two-element array: an offset from `0.0` (the start
point) to `1.0` (the end point), and a color at that point. Offsets outside
`0.0`-`1.0` are clamped rather than rejected. Stops don't need to be listed in
offset order.

The gradient's axis is in the **same coordinate space as the shape it's
applied to** — not normalized to the shape's own bounding box — so the same
`color::linear_gradient(...)` value can be reused across several shapes and
still line up between them, the way a background gradient would.

### Examples

```
// A horizontal fade from red to blue across a 400px-wide shape
color::linear_gradient(
  x0: 0.0, y0: 0.0, x1: 400.0, y1: 0.0,
  color_stops: [[0.0, $COLOR_RED], [1.0, $COLOR_BLUE]]
)

// Diagonal, three stops
color::linear_gradient(
  x0: 0.0, y0: 0.0, x1: 300.0, y1: 300.0,
  color_stops: [
    [0.0, color::hsl(h: 0.0, s: 1.0, l: 0.5)],
    [0.5, color::hsl(h: 0.33, s: 1.0, l: 0.5)],
    [1.0, color::hsl(h: 0.66, s: 1.0, l: 0.5)]
  ]
)
```

## Using in Draw Commands

Color constructors are expressions and can be used anywhere a color is expected:

```
render {
  draw::background(color: color::rgb(r: 0.1, g: 0.1, b: 0.2))

  draw::circle(
    x: 400.0,
    y: 300.0,
    radius: 50.0,
    color: color::hsl(h: $TIME_SEC * 0.1, s: 1.0, l: 0.5)
  )
}
```

## Using a Gradient

`draw::background`, `draw::rect`, `draw::circle`, `draw::ellipse`,
`draw::polygon`, `draw::text`, and `draw::line` each accept a **`gradient`**
argument alongside `color`. Supply one or the other — a gradient, when
present, wins:

```
render {
  draw::rect(
    x: 100.0, y: 100.0, width: 600.0, height: 200.0,
    gradient: color::linear_gradient(
      x0: 100.0, y0: 0.0, x1: 700.0, y1: 0.0,
      color_stops: [
        [0.0, color::rgb(r: 1.0)],
        [0.5, color::rgb(g: 1.0)],
        [1.0, color::rgb(b: 1.0)]
      ]
    )
  )
}
```

On `draw::background`, `draw::rect`, `draw::circle`, `draw::ellipse`,
`draw::polygon`, and `draw::text`, `gradient` only affects the *fill* — a
shape drawn with `stroke: true` still strokes with `stroke_color`, which
stays a plain color.

`draw::line` has no separate fill: its `color` already draws the stroke, so
`gradient` there replaces that stroke directly —

```
render {
  let g = color::linear_gradient(
    x0: 0.0, y0: 0.0, x1: 800.0, y1: 600.0,
    color_stops: [[0.0, $COLOR_RED], [1.0, $COLOR_BLUE]]
  )

  draw::line(x1: 0.0, y1: 0.0, x2: 800.0, y2: 600.0, gradient: g, stroke_weight: 4.0)
}
```
