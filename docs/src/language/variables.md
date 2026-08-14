# Variables & Assignment

## Declaring Variables

Use `let` to declare local variables within blocks:

```
on_frame {
  let speed = 2.0
  let name = "player"
}

layer_2d {
  let radius = 50.0
  draw::circle(x: 400.0, y: 300.0, radius: radius, color: $COLOR_RED)
}
```

## Rules

- Variables declared with `let` are local to their block
- Variables cannot shadow properties or other variables in the same scope
- Variables are scoped to the block they're declared in (including control flow blocks)

```
layer_2d {
  let x = 100.0
  if true {
    let y = 200.0    // y is only available inside this if block
    draw::circle(x: x, y: y, radius: 10.0, color: $COLOR_RED)
  }
  // y is NOT available here
}
```

## Assignment

Assign new values to existing variables with `=`:

```
prop count = 0

on_frame {
  count = count + 1    // Assign to existing property
}
```

## Properties vs Variables

| | Properties | Local Variables |
|---|---|---|
| **Declared with** | `prop` at top level | `let` inside blocks |
| **Scope** | Entire script | Current block |
| **Lifetime** | Persists across frames | Created each frame |
| **Writable in on_frame** | Yes | Yes |
| **Writable in layer_2d** | No | Yes |
| **Readable in layer_2d** | Yes | Yes |

Use properties for state that needs to persist between frames (animation counters, positions, etc.). Use local variables for temporary calculations within a single frame.
