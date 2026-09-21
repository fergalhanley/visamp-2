# Troubleshooting

## An error points to a statement

Runtime errors include the source location of the statement being evaluated.
Check that statement and any functions it calls. Exact expression highlighting
and a full function call stack are not currently available.

## “Range end must be a whole number”

Whole-number arguments, range bounds/steps and array indices automatically floor
finite floats. You can use `for i in 0..($WIDTH / 10)` or `items[$TIME_SEC % 8]`
directly. `3.9` converts to `3`; `-0.2` converts to `-1`, not zero.

An error here means the value is non-numeric, non-finite, outside the supported
integer range, or violates the argument's limits. For example, a range step of
`0.9` floors to zero and is invalid. Explicit integer division `\` still
truncates toward zero, and bitwise operators still require integer operands.
See [Control Flow](../programming/control-flow.md).

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
