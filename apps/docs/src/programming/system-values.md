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
render {
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
render {
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
render {
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

Reading `$WIDTH`/`$HEIGHT` straight into a `render` or `on_frame` block, as
above, recomputes derived values every frame even though the canvas is
usually not resizing. If that derivation is expensive, do it once instead —
in [`on_init`](../language/blocks.md#on_init) for the size the script starts
at, and in [`on_resize`](../language/blocks.md#on_resize) for whenever it
changes after that (entering fullscreen, the window resizing):

```
prop unit = 0.0

on_init {
  unit = $HEIGHT / 100.0
}

on_resize {
  unit = $HEIGHT / 100.0
}

render {
  draw::circle(x: $WIDTH / 2.0, y: $HEIGHT / 2.0, radius: unit * 20.0, color: $COLOR_TURQUOISE)
}
```

## Audio

Audio analysis is provided by the [audio::detect standard library](audio-detection.md),
not system constants. Use `get_level()` for smoothed RMS, `get_bass()` / `get_mid()` /
`get_treble()` for frequency bands, and `get_beat()` / `get_onset()` for events.
Waveform samples are signed −1…+1; spectrum samples are linear amplitudes 0…1.
Silence gives zero-filled arrays and zero/false scalar readings.

```visript
render {
  draw::background(color: $COLOR_BLACK)
  for i in 0..32 {
    let level = audio::detect::get_spectrum()[i * 8]
    draw::rect(
      x: i * ($WIDTH / 32), y: $HEIGHT * (1 - level),
      width: $WIDTH / 32 - 2, height: $HEIGHT * level,
      color: $COLOR_TEAL
    )
  }
}
```

See the audio reference for frame consistency, smoothing, band definitions and
beat/onset examples. Older scripts need the [4.0 migration](../language/audio-migration.md).

## Input

| Value | Type | Description |
|-------|------|-------------|
| `$MOUSE_X` | Float | Mouse X position relative to canvas |
| `$MOUSE_Y` | Float | Mouse Y position relative to canvas |

```
render {
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

render {
  draw::background(color: $COLOR_BLACK)

  // Pulsing size based on time, scaled to the canvas
  let size = $HEIGHT / 30.0 + math::sin(rad: $TIME_SEC * 3.0) * ($HEIGHT / 60.0)

  draw::circle(
    x: trail_x,
    y: trail_y,
    radius: size,
    color: color::hsl(h: $TIME_SEC * 0.1, s: 1.0, l: 0.5)
  )
}
```
