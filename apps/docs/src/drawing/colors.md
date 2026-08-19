# Colors

Visamp provides 32 named color constants plus RGB and HSL color constructors.

## Named Colors

Use color constants with the `$COLOR_` prefix:

```
draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)
```

### Full Palette

| | | | |
|---|---|---|---|
| `$COLOR_BLACK` | `$COLOR_WHITE` | `$COLOR_RED` | `$COLOR_GREEN` |
| `$COLOR_BLUE` | `$COLOR_ORANGE` | `$COLOR_YELLOW` | `$COLOR_PINK` |
| `$COLOR_MAGENTA` | `$COLOR_CYAN` | `$COLOR_TEAL` | `$COLOR_TURQUOISE` |
| `$COLOR_NAVY` | `$COLOR_INDIGO` | `$COLOR_VIOLET` | `$COLOR_PURPLE` |
| `$COLOR_LAVENDER` | `$COLOR_BROWN` | `$COLOR_MAROON` | `$COLOR_OLIVE` |
| `$COLOR_FOREST_GREEN` | `$COLOR_GOLD` | `$COLOR_SILVER` | `$COLOR_GRAY` |
| `$COLOR_DARK_GRAY` | `$COLOR_LIGHT_GRAY` | `$COLOR_CRIMSON` | `$COLOR_CORAL` |
| `$COLOR_SALMON` | `$COLOR_SAND` | `$COLOR_BEIGE` | `$COLOR_SKY_BLUE` |
| `$COLOR_AMBER` | `$COLOR_LIME` | `$COLOR_CHARTREUSE` | `$COLOR_TAN` |

## Color Constructors

For custom colors, use `color::rgb()` or `color::hsl()`.

### RGB

```
color::rgb(r: 1.0, g: 0.5, b: 0.0, transparent: 0.2)
```

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `r` | 0.0 - 1.0 | 0.0 | Red component |
| `g` | 0.0 - 1.0 | 0.0 | Green component |
| `b` | 0.0 - 1.0 | 0.0 | Blue component |
| `transparent` | 0.0 - 1.0 | 0.0 | Transparency (0 = opaque, 1 = fully transparent) |

All parameters are optional.

### HSL

```
color::hsl(h: 0.5, s: 0.8, l: 0.5, transparent: 0.0)
```

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `h` | 0.0 - 1.0 | 0.0 | Hue (wraps around) |
| `s` | 0.0 - 1.0 | 0.0 | Color intensity |
| `l` | 0.0 - 1.0 | 0.0 | Brightness (0 = black, 0.5 = color, 1 = white) |
| `transparent` | 0.0 - 1.0 | 0.0 | Transparency |

All parameters are optional.

### Examples

```
// Custom orange
let my_orange = color::rgb(r: 1.0, g: 0.65, b: 0.0)

// Semi-transparent blue
let ghost_blue = color::rgb(b: 1.0, transparent: 0.5)

// Rainbow colors using HSL
let red = color::hsl(h: 0.0, s: 1.0, l: 0.5)
let green = color::hsl(h: 0.33, s: 1.0, l: 0.5)
let blue = color::hsl(h: 0.66, s: 1.0, l: 0.5)
```
