# Control Flow

Visamp supports if/else, for loops, and while loops.

## if / else

Execute code conditionally.

```
if <condition> {
  // runs when condition is true
} else {
  // runs when condition is false
}
```

### Examples

```
// Simple if
if x > 100 {
  draw::circle(x: x, y: 300.0, radius: 20.0, color: $COLOR_RED)
}

// if/else
if angle > 3.14 {
  draw::rect(x: 100.0, y: 100.0, width: 50.0, height: 50.0, color: $COLOR_BLUE)
} else {
  draw::rect(x: 100.0, y: 100.0, width: 50.0, height: 50.0, color: $COLOR_GREEN)
}

// Nested
if x > 400 {
  if y > 300 {
    draw::circle(x: x, y: y, radius: 10.0, color: $COLOR_RED)
  }
}
```

### Conditions

Any expression that evaluates to a boolean:

```
if count == 10 { ... }
if x < $WIDTH { ... }
if visible && active { ... }
if !(done) { ... }
```

## for

Iterate over an array.

```
for <variable> in <array> {
  // body runs once per element
}
```

### Examples

```
// Draw 5 circles in a row
for i in [0, 1, 2, 3, 4] {
  draw::circle(x: i * 150.0 + 100.0, y: 300.0, radius: 30.0, color: $COLOR_BLUE)
}

// Draw a grid
for row in [0, 1, 2] {
  for col in [0, 1, 2, 3] {
    draw::rect(
      x: col * 100.0 + 50.0,
      y: row * 100.0 + 50.0,
      width: 80.0,
      height: 80.0,
      color: $COLOR_TEAL
    )
  }
}

// Iterate over coordinates
for point in [[100.0, 200.0], [300.0, 400.0], [500.0, 200.0]] {
  draw::circle(x: point, y: 300.0, radius: 20.0, color: $COLOR_GOLD)
}
```

## while

Repeat while a condition is true.

```
while <condition> {
  // body runs while condition is true
}
```

### Examples

```
// Count up
prop x = 0.0

on_frame {
  while x < 10 {
    x = x + 1
  }
}

// Safety limit: while loops are capped at 10,000 iterations
// to prevent infinite loops from freezing the browser
```

> **Note:** While loops have a safety limit of 10,000 iterations to prevent infinite loops from freezing the browser.

## Scope

Variables declared inside control flow blocks are local to that block:

```
layer_2d {
  let x = 100.0

  if true {
    let y = 200.0    // y only exists inside this if block
    draw::circle(x: x, y: y, radius: 10.0, color: $COLOR_RED)
  }

  // y is NOT available here
  // x IS available here
}
```
