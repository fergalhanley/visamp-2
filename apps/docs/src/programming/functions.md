# Functions

Define reusable routines with `fn`. Functions follow the same named-argument style as built-in draw commands like `draw::circle(...)`.

## Syntax

```
fn <name>(<param>: <default>, ...) {
  // body
  return <value>    // optional
}
```

### Rules

- A function **must** have a name
- Each parameter **must** have a default value — the default defines the type
- All parameters are **optional** at call sites — omitted args use their default
- Calls **must** use named arguments — positional args are not allowed
- Functions with **no parameters** are allowed

## No Parameters

```
fn getOne() {
  return 1
}

fn randomColor() {
  return color::hsl(hue: $TIME_SEC * 0.1, saturation: 0.8, lightness: 0.5)
}

layer_2d {
  draw::background(color: randomColor())
}
```

## Parameters with Defaults

```
fn dot(x: 0.0, y: 0.0, color: $COLOR_RED) {
  draw::circle(x: x, y: y, radius: 10.0, color: color)
}

layer_2d {
  draw::background(color: $COLOR_BLACK)
  dot(x: 200.0, y: 300.0, color: $COLOR_RED)
  dot(x: 400.0, y: 300.0, color: $COLOR_GREEN)
  dot(x: 600.0, y: 300.0)                  // color defaults to $COLOR_RED
}
```

## Named Arguments

All calls use named arguments, matching the draw command style:

```
fn greet(name: "world", excited: false) {
  // ...
}

greet(name: "visamp", excited: true)   // all args
greet(name: "visamp")                  // excited defaults to false
greet(excited: true)                   // name defaults to "world"
greet()                                // all defaults
```

Arguments can be provided in **any order**:

```
dot(color: $COLOR_BLUE, y: 200.0, x: 300.0)   // same as dot(x: 300.0, y: 200.0, color: $COLOR_BLUE)
```

## Default Values

Defaults serve two purposes:

1. **Type inference** — the default value determines the parameter's type
2. **Optional arguments** — callers can omit any parameter

```
fn draw_star(x: 400.0, y: 300.0, size: 40.0, color: $COLOR_GOLD, rotate: 0.0) {
  draw::polygon(
    points: [
      [x, y - size],
      [x + size * 0.5, y],
      [x + size, y - size * 0.3],
      [x + size * 0.6, y + size * 0.3],
      [x + size * 0.8, y + size],
      [x, y + size * 0.5],
      [x - size * 0.8, y + size],
      [x - size * 0.6, y + size * 0.3],
      [x - size, y - size * 0.3],
      [x - size * 0.5, y],
    ],
    color: color,
    rotate: rotate
  )
}

layer_2d {
  draw::background(color: $COLOR_NAVY)
  draw_star()                                           // all defaults
  draw_star(x: 200.0, y: 200.0, color: $COLOR_CORAL)   // override some
  draw_star(x: 600.0, y: 400.0, size: 60.0, rotate: 0.5)
}
```

## Return Values

Use `return` to send a value back to the caller:

```
fn double(x: 0.0) {
  return x * 2.0
}

fn add(a: 0.0, b: 0.0) {
  return a + b
}

on_frame {
  let result = double(x: 5.0)    // 10.0
  let sum = add(a: 3.0, b: 4.0)  // 7.0
}
```

If a function doesn't explicitly return, it returns `false`.

## Scope

- Functions are defined at the **top level** (alongside `prop` declarations and blocks)
- Functions can be called from `on_frame`, `layer_2d`, and other functions
- Functions **cannot** access or modify properties directly — pass values as parameters

```
fn helper(x: 0.0) {
  return x + 10.0
}

prop val = 0.0

on_frame {
  val = helper(x: val)
}

layer_2d {
  let computed = helper(x: 5.0)
  draw::circle(x: computed, y: 300.0, radius: 20.0, color: $COLOR_RED)
}
```

## Alignment with Draw Commands

User-defined functions use the exact same conventions as built-in draw commands:

```
// Built-in — named args, all optional with defaults
draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)

// User-defined — same style
fn my_circle(x: 0.0, y: 0.0, radius: 50.0, color: $COLOR_WHITE) {
  draw::circle(x: x, y: y, radius: radius, color: color)
}

my_circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)
```
