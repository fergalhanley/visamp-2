# Create with Visript

Visript is **Visamp’s language for realtime visuals**. Write a few lines, see them
render, then add motion, audio, interaction and effects. Scripts run in your
browser as WebAssembly, with Canvas 2D and WebGL2 doing the drawing.

<div class="docs-version">Language reference · Engine 5.2</div>

## Start with a moving shape

```visript
render {
  draw::background(color: color::rgb(r: 0.02, g: 0.03, b: 0.06))
  draw::circle(
    x: $WIDTH / 2 + math::sin(rad: $TIME_SEC) * $WIDTH * 0.2,
    y: $HEIGHT / 2,
    radius: $HEIGHT * 0.08,
    color: $COLOR_TURQUOISE
  )
  effect::bloom(threshold: 0.5, intensity: 1.5, radius: 12)
}
```

Paste this into the Visamp editor. No script build step is needed.

## Find your next step

- **New to Visript?** Follow [Quick Start](getting-started/quick-start.md) and
  [Your First Script](getting-started/first-script.md).
- **Draw something:** explore [2D primitives](drawing/primitives.md),
  [paths and transforms](drawing/creative-tools.md), or [3D](3d/overview.md).
- **Make it react:** use [audio detection](programming/audio-detection.md) and
  [pointer/keyboard input](programming/input-detection.md).
- **Shape the whole image:** combine [effects](effects/frame-effects.md),
  [filters](effects/filters.md) and [feedback](effects/scramble.md).
- **Try complete scripts:** browse [examples and sample packs](examples/sample-packs.md).
- **Something is wrong?** Start with [errors and troubleshooting](getting-started/troubleshooting.md).

## Language and files

The language is **Visript**; its standard file extension is **`.viscript`**.
Use `visript` for Markdown code fences. `.vdsl` remains a legacy file alias.
This reference describes the current 5.2 language. Old parameter names and audio
constants may require updates; see [language conventions](language/conventions.md)
and the [audio migration notes](language/audio-migration.md).

Dimensions are canvas pixels in 2D and world units in 3D. Named arguments,
explicit angle units and a small set of lifecycle blocks keep scripts readable.
The [standard-library guide](language/standard-library.md) maps each namespace to
its reference page.
