# Oscillators

`oscillator` returns deterministic float samples of the shared animation time
used by `$TIME_SEC`. All arguments are optional numeric expressions; integers
are accepted and named arguments may appear in any order.

```visript
oscillator::sin(min: 0.0, max: 1.0, period: 1.0, phase: 0.0)
oscillator::cos(min: 0.0, max: 1.0, period: 1.0, phase: 0.0)
oscillator::saw(min: 0.0, max: 1.0, period: 1.0, phase: 0.0)
oscillator::triangle(min: 0.0, max: 1.0, period: 1.0, phase: 0.0)
oscillator::square(min: 0.0, max: 1.0, period: 1.0, phase: 0.0, duty: 0.5)
```

These signatures are expressions, not complete scripts.

| Argument | Default | Meaning |
| --- | --- | --- |
| `min` | `0.0` | Lower bound |
| `max` | `1.0` | Upper bound |
| `period` | `1.0` | Seconds for a **complete** cycle; strictly positive |
| `phase` | `0.0` | Cycle offset; positive advances, `0.25` advances a quarter-cycle |
| `duty` | `0.5` | Square only: fraction spent at `max`, inclusive range `0..1` |

Every argument must be finite. `min` must not exceed `max`. Equal bounds return
that value, but all other arguments are still validated. Invalid literal values
produce validation errors; invalid dynamic values produce runtime errors.
Unknown arguments, duplicate arguments and unsupported types are errors.
There are no `interval`, `linear`, or `boomerang` aliases.

For time `t` in seconds, wrap `t / period + phase` into `[0, 1)` to obtain `p`,
including negative times and offsets. Return `min + (max - min) * w(p)`:

| Function | `w(p)` | Start at phase zero |
| --- | --- | --- |
| `sin` | `(1 + sin(2 * pi * p)) / 2` | Midpoint, rising |
| `cos` | `(1 + cos(2 * pi * p)) / 2` | Maximum |
| `saw` | `p` | Minimum |
| `triangle` | `1 - abs(2 * p - 1)` | Minimum, rising |
| `square` | `1` if `p < duty`, otherwise `0` | Maximum if duty is positive |

Saw resets to the minimum exactly at a cycle boundary, with no extra maximum
sample. Triangle rises for half the period and falls for half. Square switches
to minimum exactly at the duty boundary. Duty `0` is constant minimum; duty `1`
is constant maximum.

## Evaluate each frame

Calls sample the current timeline. They do not create an oscillator object or
make a one-time assignment reactive. Evaluate in `render` or `on_frame` to
animate. Dynamic period and phase changes immediately resample the current time
and may cause a jump. All calls within a frame share a timestamp, independent
of call order or frame rate. Host timeline pause freezes samples; resume, seek,
restart and loop follow that timeline. A first call midway through playback
uses the current time, not a private clock.

```visript
context 2d
render {
  draw::background(color: $COLOR_BLACK)
  // Smooth movement around the centre over five seconds.
  let x = oscillator::sin(min: -1.0, max: 1.0, period: 5.0)
  // Starting at the minimum.
  let y = oscillator::sin(min: -1.0, max: 1.0, period: 5.0, phase: -0.25)
  // Two seconds for the full constant-speed rise and fall.
  let size = oscillator::triangle(min: 0.5, max: 1.5, period: 2.0)
  let hue = oscillator::saw(period: 3.0)
  let flash = oscillator::square(duty: 0.2)
  let glow = oscillator::sin()
  draw::circle(
    x: $WIDTH / 2 + x * 100,
    y: $HEIGHT / 2 + y * 100,
    radius: size * 30,
    color: color::hsl(h: hue, s: 0.8, l: 0.3 + glow * 0.2 + flash * 0.1)
  )
}
```

For GPU point fields, evaluate oscillators into a per-frame local before using
that value with per-point arithmetic. Per-point oscillator arguments are not
supported by the GPU expression subset.
