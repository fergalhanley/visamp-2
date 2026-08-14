# Drawing Primitives

All drawing happens inside `layer_2d` blocks using `draw::` functions.

## draw::clear

Clears the entire canvas. Call this at the start of your `layer_2d` block to start fresh each frame. Omit it to let previous frames persist (useful for trails and accumulation effects).

```
draw::clear()
```

No arguments. Clears the full canvas dimensions.

## draw::background

Fills the entire canvas with a color.

```
draw::background(color: $COLOR_BLACK)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `color` | Color | `$COLOR_BLACK` | Background color |

## draw::circle

Draws a filled circle.

```
draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | Float | 0.0 | Center X position |
| `y` | Float | 0.0 | Center Y position |
| `radius` | Float | 50.0 | Circle radius |
| `color` | Color | `$COLOR_WHITE` | Fill color |
| `stroke` | Boolean | false | Draw outline instead of fill |
| `stroke_weight` | Float | 1.0 | Outline thickness |
| `stroke_color` | Color | `$COLOR_BLACK` | Outline color |

## draw::rect

Draws a rectangle.

```
draw::rect(x: 100.0, y: 200.0, width: 150.0, height: 80.0, color: $COLOR_BLUE, rotate: 0.5)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | Float | 0.0 | Top-left X position |
| `y` | Float | 0.0 | Top-left Y position |
| `width` | Float | 100.0 | Rectangle width |
| `height` | Float | 100.0 | Rectangle height |
| `color` | Color | `$COLOR_WHITE` | Fill color |
| `stroke` | Boolean | false | Draw outline instead of fill |
| `stroke_weight` | Float | 1.0 | Outline thickness |
| `stroke_color` | Color | `$COLOR_BLACK` | Outline color |
| `rotate` | Float | 0.0 | Rotation in radians (around center) |

## draw::polygon

Draws a filled polygon from a list of points.

```
draw::polygon(
  points: [
    [400.0, 100.0],
    [200.0, 400.0],
    [600.0, 400.0],
  ],
  color: $COLOR_GREEN,
  rotate: 0.0
)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `points` | Array | `[]` | Array of `[x, y]` coordinate pairs |
| `color` | Color | `$COLOR_WHITE` | Fill color |
| `rotate` | Float | 0.0 | Rotation in radians (around centroid) |

## draw::line

Draws a line between two points.

```
draw::line(x1: 100.0, y1: 100.0, x2: 700.0, y2: 500.0, color: $COLOR_WHITE, stroke_weight: 2.0)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x1` | Float | 0.0 | Start X |
| `y1` | Float | 0.0 | Start Y |
| `x2` | Float | 100.0 | End X |
| `y2` | Float | 100.0 | End Y |
| `color` | Color | `$COLOR_WHITE` | Line color |
| `stroke_weight` | Float | 1.0 | Line thickness |

## draw::ellipse

Draws an ellipse.

```
draw::ellipse(x: 400.0, y: 300.0, rx: 80.0, ry: 40.0, color: $COLOR_PURPLE, rotate: 0.3)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | Float | 0.0 | Center X position |
| `y` | Float | 0.0 | Center Y position |
| `rx` | Float | 50.0 | X radius |
| `ry` | Float | 30.0 | Y radius |
| `color` | Color | `$COLOR_WHITE` | Fill color |
| `stroke` | Boolean | false | Draw outline instead of fill |
| `stroke_weight` | Float | 1.0 | Outline thickness |
| `stroke_color` | Color | `$COLOR_BLACK` | Outline color |
| `rotate` | Float | 0.0 | Rotation in radians |

## draw::text

Draws text on the canvas.

```
draw::text(content: "Hello!", x: 350.0, y: 300.0, size: 24.0, color: $COLOR_WHITE)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `content` | String | `""` | Text to display |
| `x` | Float | 0.0 | X position (baseline left) |
| `y` | Float | 0.0 | Y position (baseline) |
| `size` | Float | 16.0 | Font size in pixels |
| `color` | Color | `$COLOR_WHITE` | Text color |
| `font` | String | `"monospace"` | CSS font family |

## Coordinate System

- Origin `(0, 0)` is at the **top-left** corner
- X increases to the **right**
- Y increases **downward**
- Rotations are in **radians**, clockwise
