# Control Flow

Visript supports if/else, for loops, and while loops.

## if / else

Execute code conditionally.

```text
if <condition> {
  // runs when condition is true
} else {
  // runs when condition is false
}
```

### Examples

```visript
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

```visript
if count == 10 { ... }
if x < $WIDTH { ... }
if visible && active { ... }
if !(done) { ... }
```

## for

Iterate over an array, or over a range of numbers.

```text
for <variable> in <array> {
  // body runs once per element
}

for <variable> in <start>..<end> {
  // body runs once per number
}
```

### Ranges

Ranges count integers. `..` stops **before** the end, `..=` **includes** it:

```visript
for i in 0..5 { }     // 0 1 2 3 4
for i in 0..=5 { }    // 0 1 2 3 4 5
```

`step` changes the increment, and a negative step counts down:

```visript
for i in 0..10 step 2 { }   // 0 2 4 6 8
for i in 5..0 step -1 { }   // 5 4 3 2 1
for i in 5..=0 step -1 { }  // 5 4 3 2 1 0
```

**A descending range needs an explicit negative step.** Without one it simply
does not run, rather than quietly counting backwards:

```visript
for i in 5..0 { }           // never runs
```

Bounds can be any numeric expression; floats are implicitly floored:

```visript
prop bars = 32

render {
  for i in 0..bars {
    draw::rect(
      x: i * ($WIDTH / bars),
      y: 0,
      width: $WIDTH / bars - 2.0,
      height: $HEIGHT / 4.0,
      color: $COLOR_TEAL
    )
  }
}
```

Computed float bounds and steps are implicitly floored: `0..2.9` yields `0, 1`,
and `-0.2..2` starts at `-1`. A step that floors to `0` is rejected instead of
looping forever. Values must be finite and fit a signed 64-bit integer after
flooring. A range is also
capped at 10,000 iterations: your script runs inside the frame loop, so an
enormous one would lock the browser rather than merely being slow.

### Examples

```visript
// Draw 5 circles in a row
for i in 0..5 {
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
  draw::circle(x: point[0], y: point[1], radius: 20.0, color: $COLOR_GOLD)
}
```

## while

Repeat while a condition is true.

```text
while <condition> {
  // body runs while condition is true
}
```

### Examples

```visript
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

```visript
render {
  let x = 100.0

  if true {
    let y = 200.0    // y only exists inside this if block
    draw::circle(x: x, y: y, radius: 10.0, color: $COLOR_RED)
  }

  // y is NOT available here
  // x IS available here
}
```
