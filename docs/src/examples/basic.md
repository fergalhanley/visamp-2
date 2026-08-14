# Basic Examples

## Static Scene

```
layer_2d {
  draw::background(color: $COLOR_NAVY)

  // Moon
  draw::circle(x: 600.0, y: 100.0, radius: 40.0, color: $COLOR_GOLD)

  // Ground
  draw::rect(x: 0.0, y: 450.0, width: 800.0, height: 150.0, color: $COLOR_FOREST_GREEN)

  // Trees
  draw::polygon(
    points: [[200.0, 450.0], [150.0, 350.0], [250.0, 350.0]],
    color: $COLOR_OLIVE
  )
  draw::polygon(
    points: [[500.0, 450.0], [440.0, 320.0], [560.0, 320.0]],
    color: $COLOR_OLIVE
  )
}
```

## Color Palette Display

```
layer_2d {
  draw::background(color: $COLOR_BLACK)

  let colors = [
    $COLOR_RED, $COLOR_ORANGE, $COLOR_YELLOW, $COLOR_GREEN,
    $COLOR_TEAL, $COLOR_CYAN, $COLOR_BLUE, $COLOR_INDIGO,
    $COLOR_VIOLET, $COLOR_PURPLE, $COLOR_PINK, $COLOR_MAGENTA
  ]

  for i in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] {
    draw::rect(
      x: i * 65.0 + 20.0,
      y: 250.0,
      width: 55.0,
      height: 100.0,
      color: colors[i]
    )
  }
}
```

## Concentric Circles

```
layer_2d {
  draw::background(color: $COLOR_BLACK)

  for i in [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] {
    draw::circle(
      x: 400.0,
      y: 300.0,
      radius: i * 25.0,
      color: color::hsl(hue: i * 0.1, saturation: 0.8, lightness: 0.5),
      stroke: true,
      stroke_weight: 2.0
    )
  }
}
```

## Grid Pattern

```
fn cell(cx, cy, size, hue) {
  draw::rect(
    x: cx - size / 2.0,
    y: cy - size / 2.0,
    width: size - 4.0,
    height: size - 4.0,
    color: color::hsl(hue: hue, saturation: 0.7, lightness: 0.5),
    rotate: hue * 3.14
  )
}

layer_2d {
  draw::background(color: $COLOR_BLACK)

  for row in [0, 1, 2, 3, 4, 5] {
    for col in [0, 1, 2, 3, 4, 5, 6, 7] {
      let hue = (row * 8 + col) * 0.02
      cell(col * 95.0 + 50.0, row * 95.0 + 50.0, 80.0, hue)
    }
  }
}
```

## Mouse Trail

```
prop trail_x = 400.0
prop trail_y = 300.0

on_frame {
  trail_x = trail_x + ($MOUSE_X - trail_x) * 0.08
  trail_y = trail_y + ($MOUSE_Y - trail_y) * 0.08
}

layer_2d {
  draw::background(color: $COLOR_BLACK)

  draw::circle(
    x: trail_x,
    y: trail_y,
    radius: 25.0,
    color: color::hsl(hue: $TIME_SEC * 0.2, saturation: 1.0, lightness: 0.6)
  )
}
```
