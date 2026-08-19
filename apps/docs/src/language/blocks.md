# Blocks

Blocks are the top-level execution units in Visamp. There are two types: `on_frame` and `render`.

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
- Runs before `render` each frame

## render

Runs once per frame, after `on_frame`. Use it to draw graphics.

```
render {
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

1. Every `on_frame` block runs, in the order it appears in the script
2. The `render` block runs

`on_frame` is always finished before `render` starts, so `render` always draws
from state that is current for this frame. That guarantee is what lets you
update a property in `on_frame` and read it in `render` without worrying about
which one you wrote first.

Nothing clears the canvas for you. A frame paints over whatever the last one
left behind, which is what makes trails possible:

```
render {
  // A nearly-transparent wash instead of a clear — old frames fade out
  draw::rect(
    x: 0,
    y: 0,
    width: $WIDTH,
    height: $HEIGHT,
    color: color::rgb(transparent: 0.93)
  )
  draw::circle(x: x, y: y, radius: 12.0, color: $COLOR_CYAN)
}
```

Call `draw::background` or `draw::clear` first if you want a clean frame.

## How many blocks

You may have **as many `on_frame` blocks as you like**, and **exactly one
`render` block**. A second `render` block is a parse error:

```
render {
  draw::clear()
}

render {          // error: only one render block is allowed
  draw::clear()
}
```

Splitting update logic across several `on_frame` blocks is fine — they run in
source order:

```
on_frame {
  // Update physics
}

on_frame {
  // Update animations
}

render {
  // Draw everything
}
```
