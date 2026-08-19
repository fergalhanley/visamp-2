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

## Audio

| Value | Type | Description |
|-------|------|-------------|
| `$TIME_DOMAIN_DATA` | Array | The waveform. Each value 0–255, centred on **128** for silence |
| `$FREQUENCY_DATA` | Array | The spectrum, low frequencies first. Each value 0–255 |
| `$BEAT` | Boolean | True on the frame a beat is detected |

These come from the audio source chosen in the A panel — a SoundCloud
playlist, your own files, or the microphone. **With no audio playing both
arrays are empty and `$BEAT` is false**, so a script that loops over them
simply draws nothing rather than failing. Every visualisation must still work
in silence.

Array lengths follow the analyser: `$TIME_DOMAIN_DATA` has one value per
sample in the FFT window (2048 by default) and `$FREQUENCY_DATA` has half that
(1024 bins).

### Reacting to the spectrum

Iterate the whole spectrum with `for`:

```
render {
  draw::background(color: $COLOR_BLACK)

  let x = 0.0
  let width = $WIDTH / 1024.0

  for v in $FREQUENCY_DATA {
    draw::rect(
      x: x,
      y: $HEIGHT - v / 255.0 * $HEIGHT,
      width: width,
      height: v / 255.0 * $HEIGHT,
      color: $COLOR_TURQUOISE
    )
    x = x + width
  }
}
```

> A full 1024-bar spectrum is a lot of drawing for one frame. If it feels
> sluggish, draw fewer bars by indexing instead of iterating every bin.

Or pick out individual bins by index — reading past the end gives 0, so this
is safe when nothing is playing:

```
render {
  let bass = $FREQUENCY_DATA[4]
  let mid  = $FREQUENCY_DATA[128]

  draw::background(color: $COLOR_BLACK)
  draw::circle(
    x: $WIDTH / 3.0,
    y: $HEIGHT / 2.0,
    radius: 20.0 + bass / 2.0,
    color: $COLOR_CRIMSON
  )
  draw::circle(
    x: $WIDTH / 3.0 * 2.0,
    y: $HEIGHT / 2.0,
    radius: 20.0 + mid / 2.0,
    color: $COLOR_TURQUOISE
  )
}
```

Drawing a fixed number of bars by sampling the spectrum:

```
render {
  draw::background(color: $COLOR_BLACK)
  let bars = 32

  for i in 0..bars {
    let v = $FREQUENCY_DATA[i * 8]
    draw::rect(
      x: i * ($WIDTH / bars),
      y: $HEIGHT - v / 255.0 * $HEIGHT,
      width: $WIDTH / bars - 2.0,
      height: v / 255.0 * $HEIGHT,
      color: $COLOR_TEAL
    )
  }
}
```

### Reacting to loudness

Averaging the spectrum gives a simple overall level:

```
prop level = 0.0

on_frame {
  let total = 0.0
  let n = 0.0

  for v in $FREQUENCY_DATA {
    total = total + v
    n = n + 1.0
  }

  // Guard against silence, where the array is empty
  if n > 0.0 {
    level = total / n
  }
}

render {
  draw::background(color: $COLOR_BLACK)
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: $HEIGHT / 8.0 + level,
    color: $COLOR_TURQUOISE
  )
}
```

### Reacting to beats

`$BEAT` is true only on the frame the beat lands, so it reads as a single
flash. Decay a property to turn it into something you can see:

```
prop pulse = 0.0

on_frame {
  pulse = pulse * 0.9

  if $BEAT {
    pulse = $HEIGHT / 6.0
  }
}

render {
  draw::background(color: $COLOR_BLACK)
  draw::circle(
    x: $WIDTH / 2.0,
    y: $HEIGHT / 2.0,
    radius: $HEIGHT / 10.0 + pulse,
    color: $COLOR_CRIMSON
  )
}
```

Beats are detected from energy in the low end of the spectrum against a
rolling average, so kicks register well and sustained pads generally do not.
There is a short refractory period, meaning beats cannot fire more often than
about once every 120ms.

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
  let size = $HEIGHT / 30.0 + math::sin(radians: $TIME_SEC * 3.0) * ($HEIGHT / 60.0)

  draw::circle(
    x: trail_x,
    y: trail_y,
    radius: size,
    color: color::hsl(h: $TIME_SEC * 0.1, s: 1.0, l: 0.5)
  )
}
```
