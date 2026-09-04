# Validator assets

Assets are immutable once used by a deployed validator. Never edit an existing
version: add a new version and update the exported version in `src/assets.mjs`.
Generation records retain both the reference-script and audio-fixture-set
versions so historical frame-cost ratios remain comparable.

The `v1` set contains two deterministic synthetic signals and an original
music-like fixture authored for VisAmp. A future recorded clip must be owned by
VisAmp or CC0 and must ship as a new fixture-set version with its provenance.
