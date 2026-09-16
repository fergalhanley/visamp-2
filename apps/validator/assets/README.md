# Validator assets

Assets are immutable once used by a deployed validator. Never edit an existing
version: add a new version and update the exported version in `src/assets.mjs`.
Generation records retain both the reference-script and audio-fixture-set
versions so historical frame-cost ratios remain comparable.

The `v1` set contains two deterministic synthetic signals and an original
music-like fixture authored for VisAmp. A future recorded clip must be owned by
VisAmp or CC0 and must ship as a new fixture-set version with its provenance.

The `v2` set and reference script use engine 4.0's normalized `audio::detect`
contract. Fixtures provide signed waveform samples, linear spectrum amplitudes,
RMS level and deterministic beat/onset events. They test renderer responses to
analysis snapshots; they do not simulate the production detector. Archived `v1`
assets require the pre-4.0 engine and are retained for historical records only.

The version 2 reference positions spectrum bars inside the viewport and animates
hue sufficiently to exercise the validator's default frame-variation threshold.
It passes the default uniformity, frame variation and audio-response checks.

Version 3 adds independent byte-frequency fixtures and exercises `get_frequency()`
in the reference script. The normalized spectrum and waveform remain available.
