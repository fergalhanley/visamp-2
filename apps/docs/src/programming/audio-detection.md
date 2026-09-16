# Audio detection

Engine **3.1** adds snapshot-reading expressions in `audio::detect`. All calls use
named arguments and work in both 2D and 3D. Existing `$TIME_DOMAIN_DATA`,
`$FREQUENCY_DATA` and `$BEAT` retain their earlier byte-based analysis behaviour;
no stored-source migration is required for this addition.

## Functions

| Function | Result | Meaning |
| --- | --- | --- |
| `get_waveform()` | Float array | Recent mono PCM samples, clamped to −1…+1; silence is zero |
| `get_spectrum()` | Float array | Linear spectral amplitudes, 0…1; index 0 is DC |
| `get_level()` | Float | Smoothed waveform RMS, 0…1 |
| `get_beat()` | Boolean | One or more detected rhythmic low-frequency attacks since the previous rendered frame |
| `get_bass()` | Float | Spectral band level over 20–250 Hz |
| `get_mid()` | Float | Spectral band level over 250–4,000 Hz |
| `get_treble()` | Float | Spectral band level over 4,000–16,000 Hz |
| `get_band_level(low_hz:, high_hz:)` | Float | Custom spectral band level, 0…1 |
| `get_onset()` | Boolean | One or more detected attacks since the previous rendered frame |
| `get_onset_strength()` | Float | Peak normalized attack strength since the previous rendered frame, 0…1 |

For example:

```visript
prop flash = 0.0

on_frame {
  flash *= 0.9
  if audio::detect::get_onset() {
    flash = audio::detect::get_onset_strength()
  }
}

render {
  draw::background(color: $COLOR_BLACK)
  draw::circle(
    x: $WIDTH / 2,
    y: $HEIGHT / 2,
    radius: 40 + audio::detect::get_bass() * 300,
    color: color::rgb(r: flash, g: audio::detect::get_level(), b: 0.6)
  )
}
```

## Frame consistency and array lifetime

Every rendered frame latches one shared snapshot **before `on_frame`**. `on_frame`
and `render` therefore see the same waveform, spectrum and scalar values. Reading
an event does not consume it: ten calls to `get_beat()` in that frame give the
same Boolean. Several events between frames collapse to `true`, not a count.
Events are consumed at the next render boundary; they do not repeatedly fire
when no further audio events arrive. Capture reads the current frame without
consuming its pending events.

Waveform/spectrum getters share immutable backing buffers. Calling one inside a
loop does not recompute an FFT or allocate another array. A saved array reference
keeps that snapshot when a later frame arrives. Indexing and `for` iteration work;
these snapshots cannot be mutated with indexed assignment. Copy desired values
into an `array::filled` property if mutable history is needed.

```visript
context 3d
render {
  draw::point_cloud(
    count: 128,
    x: $POINT_INDEX * 0.04 - 2.5,
    y: audio::detect::get_spectrum()[$POINT_INDEX] * 8,
    size: 4
  )
}
```

Array indexes follow the existing integer-index rules. GPU point/grid fields can
index a frame's audio array, or use scalar readings as frame constants. Custom
band bounds must be frame values when used within a dependent GPU field; compute
per-point band calculations outside that field. Lifecycle initialization/resize
reads the last latched snapshot; `on_frame` is the place to react to events.

## Analysis and normalization

The host uses an **AudioWorklet**, so FFT and event detection run on the audio
thread rather than on `requestAnimationFrame`. Audio events are carried forward
to the main thread and latched by the engine. A stalled renderer does not stop
detection. Delivery still has worklet/message/render latency; this is not a
sample-accurate scheduling API. Only one worklet message is in flight at a time;
cumulative event counters preserve intervening events without an unbounded queue.

Current implementation:

- A 2,048-sample Hann-window FFT, updated every 512 audio samples.
- 1,024 spectrum bins. Bin spacing is `sample_rate / 2048`, covering DC through
  just below Nyquist. The actual audio context's sample rate is used.
- The latest 1,024 waveform samples, oldest first, from that analysis window.
  Channels are averaged to mono; anti-phase stereo can cancel. Samples are
  clamped to the documented range before analysis.
- Spectrum uses **linear amplitude**, not decibels or byte values. Positive
  frequency magnitudes are multiplied by 4/N to compensate for the Hann window
  and FFT scaling; DC uses 2/N. A bin-centred sine of amplitude 0.8 produces a peak near 0.8.
  Values are clamped to 0…1. There is no extra spectrum smoothing.
- Level is RMS over the 2,048 unwindowed samples, followed by exponential smoothing
  with **25 ms attack** and **150 ms release** time constants. A steady sine with
  peak amplitude 1 approaches approximately 0.707.
- A band level is **RMS of the normalized spectral magnitudes within the band**,
  using fractional overlap of bins. It is not total power, waveform RMS, or
  instrument isolation. Prefix sums make custom band reads constant time.

Array sizes describe this implementation, not a permanent language guarantee.
Do not assume these arrays match the lengths or values of the older byte globals.
Without a source, normalized arrays contain zeros and scalar/event readings are
zero/false. Source changes, seeks, pauses, suspension and bridge teardown reset
the detection state. On resume, rhythm detection needs to settle again.

Custom bands require finite `0 <= low_hz < high_hz`; invalid bounds produce a
located runtime error. Bands use `[low_hz, high_hz)`, are clipped at Nyquist,
and return zero if entirely above it. The shortcuts use the exact same calculation.

## Onsets versus beats

Onset detection measures positive spectral flux across non-DC bins. Strength is
`clamp(sum_of_positive_amplitude_changes / 2, 0, 1)`. A new onset requires flux
above both an absolute floor (0.04) and three times its 300 ms adaptive baseline,
RMS above 0.001, and an 80 ms minimum gap. This is a general attack detector:
percussion, plucked notes and other sharp sound changes can all trigger it.

Beat detection uses attacks in the 20–250 Hz band with a 250 ms minimum gap.
It first establishes an interval from attacks 250–1,500 ms apart, then requires
recurrence within 20% of that interval. The third regular attack can be the first
reported beat. Accepted intervals adapt gradually. This is a lightweight
low-frequency rhythm heuristic, **not** a musical beat-grid tracker: syncopation,
missing bass attacks and irregular music can cause misses or resets. A lone
attack or a series of high-frequency clicks can be onsets without being beats.

BPM, beat phase, confidence and spectral brightness are intentionally deferred.
The new beat definition is separate from the earlier `$BEAT` detector.

## Host requirements

Serve the player's `audio-detect-worklet.mjs` asset (the VisAmp web app provides it
at `/audio-detect-worklet.mjs`). AudioWorklet requires a secure context and browser
support; startup/processor failures are logged rather than silently substituting
render-timed detection. Existing byte globals remain available on their original
bridge. Multiple visuals share the player's single audio graph; analysis does not
add audible monitoring or microphone echo.

Background suspension of the AudioContext stops audio-time processing too; no
beats are invented for a suspended source. Main-thread stalls preserve events
while audio processing continues.

## References

- [Web Audio waveform samples](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatTimeDomainData)
- [Browser float frequency data uses decibels](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatFrequencyData)
- [FFT bin count](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/frequencyBinCount)
- [AudioWorklet processing on the audio thread](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process)
