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

### Size relative to the canvas

Your script runs at more than one size. It fills the whole window in the
player, sits in a smaller 16:9 box in the editor preview, and is rendered at a
fixed **1280×720** when a thumbnail is captured.

A hard-coded pixel size therefore looks different in each of them — a
`radius: 50.0` circle that fills the editor preview nicely can look small and
lost in the thumbnail.

Position and scale relative to `$WIDTH` and `$HEIGHT` and the composition holds
everywhere:

```
layer_2d {
  // Fragile: tied to one particular canvas size
  draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)

  // Robust: the same composition at any size
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: $HEIGHT / 12.0,
    color: $COLOR_RED
  )
}
```

A useful habit is to derive one unit from the canvas and build everything from
it:

```
layer_2d {
  let unit = $HEIGHT / 100.0

  draw::rect(
    x: $WIDTH / 2.0 - unit * 20.0,
    y: $HEIGHT / 2.0 - unit * 20.0,
    width: unit * 40.0,
    height: unit * 40.0,
    color: $COLOR_TURQUOISE
  )
}
```

Scaling from `$HEIGHT` rather than `$WIDTH` keeps proportions steady when the
aspect ratio changes, since the player is as wide as the window but the
thumbnail is always 16:9.

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

  // Pulsing size based on time, scaled to the canvas
  let size = $HEIGHT / 30.0 + math::sin(radians: $TIME_SEC * 3.0) * ($HEIGHT / 60.0)

  draw::circle(
    x: trail_x,
    y: trail_y,
    radius: size,
    color: color::hsl(hue: $TIME_SEC * 0.1, saturation: 1.0, lightness: 0.5)
  )
}
```
