# Troubleshooting

## An error points to a statement

Runtime errors include the source location of the statement being evaluated.
Check that statement and any functions it calls. Exact expression highlighting
and a full function call stack are not currently available.

## “Range end must be a whole number”

Visript distinguishes integer values from float values, even when a float prints
as `240`. Division `/` produces a float. Use integer division `\` to convert:

```visript
render {
  let count = ($WIDTH / 10) \ 1
  for i in 0..count {
    draw::circle(x: i * 10, y: $HEIGHT / 2, radius: 3)
  }
}
```

`math::floor()` rounds down but still returns a float. When you need floor
semantics and an integer type, use `math::floor(value: number) \ 1`.
Array reads and writes accept whole-valued floats, so `items[math::floor(value: number)]`
works without an extra conversion. Fractional indices are rejected. See [Control Flow](../programming/control-flow.md).

## Audio looks different from an older script

`audio::detect::get_frequency()` returns 1,024 integer bins in the range 0–255.
`get_spectrum()` returns normalized linear amplitudes; it is not the old byte
array divided by 255. Waveform samples are signed, with silence at zero.
See [Audio Detection](../programming/audio-detection.md) before choosing a scale.

## An asset will not load

Check its library ID, type, and access permissions. Visamp waits for required
assets before starting playback; an unavailable asset needs correcting or
retrying. Models use uploaded GLB assets. See [Assets](../3d/assets.md).

## Nothing is visible in 3D

Check `context 3d`, the camera position and target, object scale and position,
and material alpha. Text and bitmap drawing need an overlay in 3D. The browser
must support WebGL2. Start with a [complete 3D example](../examples/3d.md).

## The thumbnail differs from playback

Check whether dimensions were cached in properties before capture. Calculate
size-dependent layout during `render`. Capture does not advance the simulation;
see [Runtime & Capture](runtime.md).

## An example does not compile when pasted alone

Some reference blocks illustrate one expression or handler. Complete scripts
include exactly one `render` block. Start with the [basic examples](../examples/basic.md),
and use named arguments and parameter defaults in functions. Old audio globals,
old parameter spellings, and positional function calls are not current syntax.
