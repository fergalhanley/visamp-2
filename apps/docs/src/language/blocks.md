# Blocks

Blocks are the top-level execution units in Visamp. There are four types:
`on_init`, `on_frame`, `on_resize`, and `render`.

## on_init

Runs once, when the script compiles — before its first frame. Use it to seed
state from the canvas size the script is starting at, or anything else that
only needs computing once.

```
prop cx = 0.0
prop cy = 0.0

on_init {
  cx = $WIDTH / 2
  cy = $HEIGHT / 2
}
```

**Rules:**
- Can read and write properties
- Can declare local variables with `let`
- Cannot call draw functions
- Runs once per compile, before anything else

A script edited in the live editor recompiles on every change, so `on_init`
runs again each time — it means "before this version's first frame", not
"only ever once for the whole session".

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

## on_resize

Runs whenever the canvas's on-screen size changes — entering or exiting
fullscreen, the browser window resizing, the editor's resizable split being
dragged. It does **not** run for the canvas's first sizing when the script
starts; that's what `on_init` is for.

```
prop scale = 1.0

on_resize {
  // Recompute anything that depends on the canvas's proportions
  scale = math::min(a: $WIDTH, b: $HEIGHT) / 800
}
```

**Rules:**
- Can read and write properties
- Can declare local variables with `let`
- Cannot call draw functions
- Runs before the next `on_frame`/`render` pass, whenever the size changes

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

Once, when the script compiles:

1. Every `on_init` block runs, in the order it appears in the script

Then, on every frame:

1. Every `on_frame` block runs, in the order it appears in the script
2. The `render` block runs

`on_frame` is always finished before `render` starts, so `render` always draws
from state that is current for this frame. That guarantee is what lets you
update a property in `on_frame` and read it in `render` without worrying about
which one you wrote first. `on_init` finishes before the first such pass, so
the very first frame already sees whatever it set up.

Separately, whenever the canvas's size changes:

1. Every `on_resize` block runs, in the order it appears in the script

This happens outside the regular per-frame cycle — as soon as the resize is
detected, before the next `on_frame`/`render` pass — rather than on a fixed
schedule.

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

You may have **as many `on_init`, `on_frame`, and `on_resize` blocks as you
like**, and **exactly one `render` block**. A second `render` block is a
parse error:

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
