# Migrating audio scripts to 4.0

Engine **4.0** removes the three audio globals. They now produce a compile error
with a source location and replacement suggestion. There are no legacy aliases.
The language remains Visript and the extension remains `.viscript`.

| Removed | Replacement | Range / meaning change |
| --- | --- | --- |
| `$FREQUENCY_DATA` | `audio::detect::get_spectrum()` | 0–255 browser-scaled dB bins → 0–1 linear amplitudes |
| `$TIME_DOMAIN_DATA` | `audio::detect::get_waveform()` | 0–255 unsigned PCM → −1…+1 signed PCM |
| `$BEAT` | `audio::detect::get_beat()` | Old frame-timed energy detector → latched rhythmic bass attacks |

## Converting calculations

A name replacement alone is insufficient. Review every use, including array
aliases, loop variables, history buffers and user-function arguments.

- Spectrum values already fit colour channels. Replace an old `bin / 255.0`
  with the normalized bin. For old `bin / 256.0`, use `bin * (255.0 / 256.0)`
  to retain its slightly smaller output range.
- Calculations tuned to byte magnitudes can use `bin * 255.0` at the point of
  consumption. This retains their numerical scale, **not** the old analyser's
  transfer function. Keep the array itself normalized and shared.
- Waveform silence is now **zero**, rather than 128. Use a signed sample directly
  for displacement, or `(sample + 1.0) / 2.0` for a 0–1 signal centred at 0.5.
  An approximate former byte magnitude is `(sample + 1.0) * 128.0` (clamp to 255
  if that exact bound matters).
- The current waveform has 1,024 samples, rather than 2,048. A visual grouping
  sixteen old samples into each of 128 bars should group eight current samples.
  Spectrum length remains 1,024 in this implementation. Do not make either
  length a permanent assumption in new designs.
- Audio arrays now contain floats. If a sample controls an integer index, range,
  bitwise operation or count, convert deliberately with `math::floor` or `\`.
- Silence produces zero-filled arrays, so loops still execute. Scripts that used
  an empty array as a “source connected” test need a different condition.

The new spectrum uses a different window, normalization and smoothing policy.
Multiplying by 255 cannot reproduce the old browser dB bins. Visual sensitivity,
colour response and motion may need artistic tuning with music after migration.
The new beat detector also fires differently; use `get_onset()` when the desired
trigger is any sharp attack rather than a recurring rhythmic bass event.

For new level-driven visuals, prefer `get_level()` (smoothed waveform RMS) or
`get_bass()` / `get_mid()` / `get_treble()`. A spectral average from an old script
is not equivalent to waveform RMS, so switching that measurement is a design
change rather than a mechanical migration.

See [Audio detection](../programming/audio-detection.md) for the complete contract.
