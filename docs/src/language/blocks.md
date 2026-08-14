# Blocks

Blocks are the top-level execution units in Visamp. There are two types: `on_frame` and `layer_2d`.

## on_frame

Runs once per frame, before rendering. Use it to update state.

```
on_frame {
  // Statements here run every frame
  angle = angle + 0.01
  x = x + speed
}
```

**Rules:**
- Can read and write properties
- Can declare local variables with `let`
- Cannot call draw functions
- Runs before `layer_2d` each frame

## layer_2d

Runs once per frame, after `on_frame`. Use it to draw graphics.

```
layer_2d {
  // Statements here run every frame, after on_frame
  draw::background(color: $COLOR_BLACK)
  draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)
}
```

**Rules:**
- Can read properties and local variables
- Can call draw functions
- Can declare local variables with `let`
- Cannot write to properties (use `on_frame` for that)

## Execution Order

Each frame:
1. All `on_frame` blocks execute in order
2. Canvas is cleared
3. All `layer_2d` blocks execute in order

## Multiple Blocks

You can have multiple blocks of each type:

```
on_frame {
  // Update physics
}

on_frame {
  // Update animations
}

layer_2d {
  // Draw background
}

layer_2d {
  // Draw foreground
}
```

Blocks execute in the order they appear in the script.
