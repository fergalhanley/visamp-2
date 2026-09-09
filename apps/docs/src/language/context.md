# Rendering Context

`context` chooses the coordinate model your script draws in. There are two:

| Context | Meaning |
|---------|---------|
| `2d` | Flat pixel coordinates — the default |
| `3d` | World-space coordinates, a camera, lights and depth |

```
context 3d

render {
  draw::cube()
}
```

> **`3d` does not render yet.** The language understands it — the grammar, the
> full builtin surface and every compile-time check described below are in
> place — but the renderer behind it is still being built. A `context 3d`
> script currently reports that when you run it, which also keeps it out of the
> save flow rather than letting you publish something that draws nothing.

## Which backend does `3d` use?

That is the engine's decision, not yours. `3d` runs on WebGL2 today and may
move to WebGPU where it is available; scripts do not change either way.

Naming a backend was never really the author's problem — what a script cares
about is whether it is drawing flat or in space.

## Rules

**Omitting it means `2d`.** These two scripts are identical:

```
render {
  draw::clear()
}
```

```
context 2d

render {
  draw::clear()
}
```

**It can go anywhere at the top level.** Convention is to put it first, but it
is legal after properties or functions:

```
prop angle = 0.0
context 3d

render {
  draw::cube()
}
```

This is why `context` is read for the whole file before anything else is
checked — a `draw::cube()` on line 2 is judged against a declaration that might
not appear until line 40.

**Declaring it twice is a parse error:**

```
context 2d
context 3d    // error: context is already set
```

## Why it is fixed for the life of a canvas

A canvas element keeps whichever backend it is first given until it is
destroyed — there is no way to switch a 2D canvas to WebGL later. The engine
therefore reads `context` when it binds to the canvas, and a script asking for
a different one cannot take over an already-initialised canvas.

## What changes between the two

Everything in the 2D language keeps working under `context 3d`. `math::`,
`color::`, properties, control flow and user functions are unaffected, and the
2D primitives — `rect`, `circle`, `ellipse`, `polygon`, `text`, `line` — stay
legal and draw on the `z = 0` plane.

What `3d` adds:

- **New arguments on the 2D primitives**: `z`, `rot_x`, `rot_y`, `rot_z`, plus
  `shading`, `wireframe`, `opacity` and `texture`. Using one of these under
  `context 2d` is an error that says so, rather than being quietly ignored.
- **New namespaces**: `camera::`, `transform::`, `light::`, `gfx::`, `asset::`,
  and the 3D primitives `draw::cube`, `sphere`, `plane`, `cylinder`, `cone`,
  `torus`, `sprite`, `mesh` and `model`. Using any of these under `context 2d`
  is an error telling you to add `context 3d`.

See [3D Mode](../3d/overview.md) for the full surface.
