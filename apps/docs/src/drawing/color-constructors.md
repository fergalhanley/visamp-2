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
