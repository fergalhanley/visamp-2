# Math Library

Visamp provides a comprehensive math library for calculations in your scripts.

## Trigonometric Functions

All trigonometric functions use **radians**.

```
math::sin(radians: 1.57)     // sine
math::cos(radians: 0.0)      // cosine  
math::tan(radians: 0.785)    // tangent
math::asin(value: 1.0)       // arc sine (returns radians)
math::acos(value: 0.0)       // arc cosine (returns radians)
math::atan(value: 1.0)       // arc tangent (returns radians)
math::atan2(y: 1.0, x: 1.0)  // arc tangent of y/x (returns radians)
```

## Powers and Roots

```
math::sqrt(value: 16.0)      // square root
math::cbrt(value: 27.0)      // cube root
math::pow(base: 2.0, exp: 3.0)  // power (2^3 = 8)
math::exp(value: 1.0)        // e^x
math::ln(value: 2.718)       // natural logarithm
math::log2(value: 8.0)       // base-2 logarithm
math::log10(value: 100.0)    // base-10 logarithm
```

## Rounding Functions

```
math::abs(value: -5.0)       // absolute value
math::floor(value: 3.7)      // round down (3.0)
math::ceil(value: 3.2)       // round up (4.0)
math::round(value: 3.5)      // round to nearest (4.0)
math::trunc(value: 3.7)      // truncate decimal (3.0)
```

## Min/Max/Clamp

```
math::min(a: 5.0, b: 3.0)    // minimum (3.0)
math::max(a: 5.0, b: 3.0)    // maximum (5.0)
math::clamp(value: 15.0, min: 0.0, max: 10.0)  // clamp to range (10.0)
```

## Math Constants

Access mathematical constants with the `$` prefix:

```
$PI     // 3.141592653589793
$E      // 2.718281828459045
$TAU    // 6.283185307179586 (2 * PI)
```

## Examples

### Circular Motion

```
prop angle = 0.0

on_frame {
  angle = angle + 0.05
}

layer_2d {
  draw::clear()
  draw::background(color: $COLOR_BLACK)
  
  let x = 400.0 + math::cos(radians: angle) * 100.0
  let y = 300.0 + math::sin(radians: angle) * 100.0
  
  draw::circle(x: x, y: y, radius: 20.0, color: $COLOR_RED)
}
```

### Wave Pattern

```
layer_2d {
  draw::clear()
  draw::background(color: $COLOR_NAVY)
  
  for i in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] {
    let x = i * 80.0 + 40.0
    let y = 300.0 + math::sin(radians: $TIME_SEC * 2.0 + i * 0.5) * 100.0
    draw::circle(x: x, y: y, radius: 15.0, color: $COLOR_CYAN)
  }
}
```

### Spiral

```
prop t = 0.0

on_frame {
  t = t + 0.1
}

layer_2d {
  draw::clear()
  draw::background(color: $COLOR_BLACK)
  
  for i in [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] {
    let angle = i * 0.5 + t
    let radius = i * 15.0
    let x = 400.0 + math::cos(radians: angle) * radius
    let y = 300.0 + math::sin(radians: angle) * radius
    draw::circle(x: x, y: y, radius: 8.0, color: $COLOR_GOLD)
  }
}
```

### Distance Calculation

```
prop x1 = 100.0
prop y1 = 100.0
prop x2 = 700.0
prop y2 = 500.0

layer_2d {
  draw::clear()
  draw::background(color: $COLOR_BLACK)
  
  // Calculate distance between two points
  let dx = x2 - x1
  let dy = y2 - y1
  let distance = math::sqrt(value: dx * dx + dy * dy)
  
  draw::line(x1: x1, y1: y1, x2: x2, y2: y2, color: $COLOR_WHITE, stroke_weight: 2.0)
  draw::text(content: "Distance: ", x: 350.0, y: 50.0, size: 20.0, color: $COLOR_WHITE)
}
```
