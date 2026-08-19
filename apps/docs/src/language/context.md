# Rendering Context

`context` chooses which canvas rendering context your script draws through.

```
context 2d

render {
  draw::circle(x: 100.0, y: 100.0, radius: 20.0, color: $COLOR_RED)
}
```

## Available contexts

| Context | Meaning |
|---------|---------|
| `2d` | Canvas 2D — the default |
| `webgl` | WebGL 1 |
| `experimental-webgl` | WebGL 1 under its older name |
| `webgl2` | WebGL 2 |
| `webgpu` | WebGPU |

> Only `2d` renders today. The other values parse and are carried through the
> engine, but asking for one currently reports that it is not implemented yet
> rather than silently drawing nothing.

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
context webgl2

render {
  draw::clear()
}
```

**Declaring it twice is a parse error:**

```
context 2d
context webgl    // error: context is already set
```

## Why it is fixed for the life of a canvas

A canvas element keeps whichever context it is first given until it is
destroyed — there is no way to switch a 2D canvas to WebGL later. The engine
therefore reads `context` when it binds to the canvas, and a script asking for
a different one cannot take over an already-initialised canvas.
