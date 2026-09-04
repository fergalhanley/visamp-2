# AI render-validator audio fixtures

- Replace the `v1` music-like analyser profile with a short recorded music
  fixture in a new fixture-set version (`v2`). Do not modify `v1`: generation
  records retain the fixture-set version, and changing an existing set would
  make historical validation results incomparable.
- Use a recording VisAmp owns outright or a clearly documented CC0 recording.
  Commit its title/source, creator, licence, download URL if applicable, and a
  copy of the licence/provenance information alongside the asset. Avoid
  attribution-required or ambiguously licensed material.
- Keep the clip short enough for fast validation while including realistic
  spectral density and meaningful changes in rhythm, bass, mids, and highs.
  Avoid long silence, clipping, and a section that is effectively a single
  sustained tone.
- Convert the clip into deterministic analyser frames matching production:
  44.1 kHz input, FFT size 2048, 2048-byte time-domain frames, 1024-byte
  frequency frames, and the production analyser's smoothing and decibel
  settings. Store or generate the frames reproducibly; validation must not
  depend on live audio playback timing.
- Keep at least two deterministic synthetic fixtures (for example, a sine
  sweep and impulse train) alongside the real clip. The real recording
  complements them; it does not replace them.
- Update `AUDIO_FIXTURE_SET_VERSION` and the fixture manifest, then run the full
  validator suite. Confirm a known-good audio-reactive reference passes the
  uniformity, across-frame variation, and across-fixture audio-response checks,
  while static and audio-ignoring scripts fail the intended checks.
- Tune thresholds only from an eval run across representative scripts. Record
  the chosen thresholds with the new fixture-set version rather than silently
  changing the meaning of an existing validation baseline.
