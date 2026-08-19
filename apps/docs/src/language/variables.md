# Variables & Assignment

## Declaring Variables

Use `let` to declare local variables within blocks:

```
on_frame {
  let speed = 2.0
  let name = "player"
}

render {
  let radius = 50.0
  draw::circle(x: 400.0, y: 300.0, radius: radius, color: $COLOR_RED)
}
```

## Rules

- Variables declared with `let` are local to their block
- Variables cannot shadow properties or other variables in the same scope
- Variables are scoped to the block they're declared in (including control flow blocks)

```
render {
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

### Compound assignment

`x += e` is shorthand for `x = x + e`, and the same for `-=`, `*=`, `/=`
and `%=`:

```
prop angle = 0.0
prop hits = 0

on_frame {
  angle += 0.05
  hits *= 2
}
```

The right-hand side is worked out in full before it is applied, so `x *= 2 + 3`
multiplies by five rather than doubling and then adding three.

These follow the same typing rules as the long form. In particular **`/=`
always produces a float**, because `/` does:

```
prop x = 9

on_frame {
  x /= 3     // 3.0, a float — use \= to keep it whole
}
```

### Increment and decrement

`x++` and `x--` add or subtract one:

```
prop frame = 0

on_frame {
  frame++
}
```

Both `x++` and `++x` are accepted and mean the same thing. They are statements
rather than expressions, so there is no "before or after" distinction to make —
`let y = x++` is not valid, and `x++` on its own line is.

Incrementing a float adds `1.0`, the way `x = x + 1` would:

```
prop x = 1.5

on_frame {
  x++        // 2.5
}
```

## Properties vs Variables

| | Properties | Local Variables |
|---|---|---|
| **Declared with** | `prop` at top level | `let` inside blocks |
| **Scope** | Entire script | Current block |
| **Lifetime** | Persists across frames | Created each frame |
| **Writable in on_frame** | Yes | Yes |
| **Writable in render** | No | Yes |
| **Readable in render** | Yes | Yes |

Use properties for state that needs to persist between frames (animation counters, positions, etc.). Use local variables for temporary calculations within a single frame.
