# Color Constructors

Color constructors let you create custom colors using RGB or HSL values.

## color::rgb()

Create a color from red, green, and blue components.

```
color::rgb(red: 1.0, green: 0.5, blue: 0.0, transparent: 0.2)
```

### Parameters

All parameters are **optional** and default to `0.0`.

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `red` | Float | 0.0 - 1.0 | 0.0 | Red intensity |
| `green` | Float | 0.0 - 1.0 | 0.0 | Green intensity |
| `blue` | Float | 0.0 - 1.0 | 0.0 | Blue intensity |
| `transparent` | Float | 0.0 - 1.0 | 0.0 | Opacity (0 = fully opaque, 1 = fully transparent) |

### Examples

```
// Pure red
color::rgb(red: 1.0)

// Custom purple
color::rgb(red: 0.6, blue: 0.8)

// Semi-transparent green
color::rgb(green: 1.0, transparent: 0.5)

// Dark gray
color::rgb(red: 0.3, green: 0.3, blue: 0.3)
```

## color::hsl()

Create a color from hue, saturation, and lightness.

```
color::hsl(hue: 0.5, saturation: 0.8, lightness: 0.5, transparent: 0.0)
```

### Parameters

All parameters are **optional** and default to `0.0`.

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `hue` | Float | 0.0 - 1.0 | 0.0 | Color angle (wraps, 0 = red) |
| `saturation` | Float | 0.0 - 1.0 | 0.0 | Color intensity (0 = gray, 1 = vivid) |
| `lightness` | Float | 0.0 - 1.0 | 0.0 | Brightness (0 = black, 0.5 = color, 1 = white) |
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
color::hsl(hue: 0.0, saturation: 1.0, lightness: 0.5)

// Pastel blue
color::hsl(hue: 0.6, saturation: 0.5, lightness: 0.7)

// Rainbow generator
fn rainbow_color(position) {
  return color::hsl(hue: position, saturation: 1.0, lightness: 0.5)
}
```

## Using in Draw Commands

Color constructors are expressions and can be used anywhere a color is expected:

```
layer_2d {
  draw::background(color: color::rgb(red: 0.1, green: 0.1, blue: 0.2))

  draw::circle(
    x: 400.0,
    y: 300.0,
    radius: 50.0,
    color: color::hsl(hue: $TIME_SEC * 0.1, saturation: 1.0, lightness: 0.5)
  )
}
```
