# System Values

System values provide access to runtime information. They are prefixed with `$`.

## Time

| Value | Type | Description |
|-------|------|-------------|
| `$TIME_SEC` | Float | Seconds since the script started |
| `$TIME_MS` | Integer | Milliseconds since the script started |

```
on_frame {
  angle = $TIME_SEC    // Continuously increasing
}
```

## Canvas

| Value | Type | Description |
|-------|------|-------------|
| `$WIDTH` | Float | Canvas width in pixels |
| `$HEIGHT` | Float | Canvas height in pixels |

```
layer_2d {
  // Draw at center of canvas
  draw::circle(x: $WIDTH / 2.0, y: $HEIGHT / 2.0, radius: 50.0, color: $COLOR_RED)
}
```

## Input

| Value | Type | Description |
|-------|------|-------------|
| `$MOUSE_X` | Float | Mouse X position relative to canvas |
| `$MOUSE_Y` | Float | Mouse Y position relative to canvas |

```
layer_2d {
  // Circle follows the mouse
  draw::circle(x: $MOUSE_X, y: $MOUSE_Y, radius: 30.0, color: $COLOR_CORAL)
}
```

## Frame

| Value | Type | Description |
|-------|------|-------------|
| `$FRAME_COUNT` | Integer | Number of frames rendered so far |

```
on_frame {
  // Flash every 60 frames (roughly once per second at 60fps)
  if $FRAME_COUNT % 60 == 0 {
    flash = true
  }
}
```

## Colors

See the [Colors](../drawing/colors.md) page for the full list of 32 color constants.

## Example: Combining System Values

```
prop trail_x = 0.0
prop trail_y = 0.0

on_frame {
  // Smooth follow toward mouse
  trail_x = trail_x + ($MOUSE_X - trail_x) * 0.1
  trail_y = trail_y + ($MOUSE_Y - trail_y) * 0.1
}

layer_2d {
  draw::background(color: $COLOR_BLACK)

  // Pulsing size based on time
  let size = 20.0 + sin($TIME_SEC * 3.0) * 10.0

  draw::circle(
    x: trail_x,
    y: trail_y,
    radius: size,
    color: color::hsl(hue: $TIME_SEC * 0.1, saturation: 1.0, lightness: 0.5)
  )
}
```
