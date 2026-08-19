# Animation Examples

## Rotating Square

```
prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

render {
  draw::background(color: $COLOR_BLACK)
  draw::rect(
    x: 350.0, y: 250.0,
    width: 100.0, height: 100.0,
    color: $COLOR_CORAL,
    rotate: angle
  )
}
```

## Bouncing Ball

```
prop x = 100.0
prop y = 300.0
prop vx = 3.0
prop vy = 2.0

on_frame {
  x = x + vx
  y = y + vy

  if x > $WIDTH - 30.0 {
    vx = -3.0
  }
  if x < 30.0 {
    vx = 3.0
  }
  if y > $HEIGHT - 30.0 {
    vy = -2.0
  }
  if y < 30.0 {
    vy = 2.0
  }
}

render {
  draw::background(color: $COLOR_NAVY)
  draw::circle(x: x, y: y, radius: 30.0, color: $COLOR_GOLD)
}
```

## Color Cycling Background

```
render {
  draw::background(
    color: color::hsl(h: $TIME_SEC * 0.05, s: 0.6, l: 0.3)
  )

  draw::text(
    content: "visamp",
    x: 320.0,
    y: 320.0,
    size: 48.0,
    color: $COLOR_WHITE
  )
}
```

## Orbiting Circles

```
prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

fn orbit_particle(a, dist, col) {
  let px = 400.0 + cos(a) * dist
  let py = 300.0 + sin(a) * dist
  draw::circle(x: px, y: py, radius: 12.0, color: col)
}

render {
  draw::background(color: $COLOR_BLACK)

  // Center
  draw::circle(x: 400.0, y: 300.0, radius: 20.0, color: $COLOR_WHITE)

  // Orbiting particles
  orbit_particle(angle, 80.0, $COLOR_RED)
  orbit_particle(angle + 1.57, 80.0, $COLOR_GREEN)
  orbit_particle(angle + 3.14, 80.0, $COLOR_BLUE)
  orbit_particle(angle + 4.71, 80.0, $COLOR_YELLOW)

  // Outer ring
  orbit_particle(angle * 0.5, 160.0, $COLOR_CYAN)
  orbit_particle(angle * 0.5 + 2.09, 160.0, $COLOR_MAGENTA)
  orbit_particle(angle * 0.5 + 4.19, 160.0, $COLOR_ORANGE)
}
```

> **Note:** This example uses `cos()` and `sin()` which would need to be implemented as system functions or user-defined approximations.

## Pulsing Ring

```
render {
  draw::background(color: $COLOR_BLACK)

  let pulse = ($TIME_SEC * 2.0) % 1.0
  let radius = pulse * 200.0
  let alpha = 1.0 - pulse

  draw::circle(
    x: 400.0,
    y: 300.0,
    radius: radius,
    color: color::rgb(r: 0.0, g: 1.0, b: 0.5, transparent: alpha),
    stroke: true,
    stroke_weight: 3.0
  )
}
```

## Wave Pattern

```
render {
  draw::background(color: $COLOR_BLACK)

  for i in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19] {
    let x = i * 40.0 + 20.0
    let y = 300.0 + sin($TIME_SEC * 2.0 + i * 0.5) * 100.0
    let hue = i * 0.05

    draw::circle(
      x: x,
      y: y,
      radius: 15.0,
      color: color::hsl(h: hue, s: 0.9, l: 0.5)
    )
  }
}
```

## Mouse-Reactive Particles

```
prop particles = [[400.0, 300.0], [350.0, 250.0], [450.0, 350.0], [300.0, 300.0], [500.0, 300.0]]

on_frame {
  // Particles drift toward mouse
  let new_particles = []
  for p in particles {
    let px = p[0] + ($MOUSE_X - p[0]) * 0.02
    let py = p[1] + ($MOUSE_Y - p[1]) * 0.02
    // Note: would need array mutation support
  }
}

render {
  draw::background(color: $COLOR_BLACK)

  for i in [0, 1, 2, 3, 4] {
    let hue = i * 0.2 + $TIME_SEC * 0.1
    draw::circle(
      x: 400.0 + sin($TIME_SEC + i) * 100.0,
      y: 300.0 + cos($TIME_SEC + i) * 100.0,
      radius: 20.0,
      color: color::hsl(h: hue, s: 0.8, l: 0.6)
    )
  }
}
```
