# Visript 5.2 effects test pack

Set `sample_owner` near the top of [import.sql](import.sql) to your profile UUID,
then run the SQL to import **21 private visualisations**. Re-importing preserves
existing scripts. This is sample data, not a database migration.

You can also paste any `.viscript` directly into the editor. Samples 01–18 isolate
one effect; their `enabled` property toggles an unprocessed comparison. Other
properties expose useful controls. Counts such as `segments`, `branches` and
`levels` must remain integers.

| Samples | What to test |
| --- | --- |
| 01 Kaleidoscope | `segments` 2–64; `branches` 1–6; triangular reflections and animated orientation |
| 02 Swirl | Positive/negative strength, unchanged pixels outside the radius |
| 03–10 Pixelation | Square, rectangular, circular, triangular, pentagonal, hexagonal, five/six-point star cells; gaps and rotation |
| 11–16 | Mirror, posterize, chromatic aberration, vignette, ripple and scanlines |
| 17 Bloom | Brightness threshold, intensity, small/large blur radius |
| 18 Displace | Red/green bitmap offsets and animated source |
| 19 Crystal bloom | Kaleidoscope, colour separation, bloom and vignette in order |
| 20 Orbit mosaic 3D | Lit meshes and text overlay processed together |
| 21 Neon feedback | Unfiltered history with ripple, bloom and scanlines applied to the output |

Sample 18 uses the existing Skullman bitmap
`081c271e-67d9-4a75-aff2-5a1bb88e4daa`; you need access to that asset.
For a clearer displacement pattern, upload the supplied **displacement-map.png**
to the asset library and replace the bitmap ID in sample 18. Its red/green waves
move the horizontal/vertical sampling coordinates. The other 20 samples need no
assets or audio.

Try resizing playback and capturing thumbnails. Capture rerenders at 1280×720;
image composition and pixel-sized effects can therefore differ from a differently
sized live canvas. Accumulated trail history in sample 21 is not part of a fresh
thumbnail render, matching the existing capture contract.

Automated browser checks: after `pnpm --filter @visamp/engine build:validator`,
serve the repository root and open `packages/engine/tests/browser/effects.html`
and `packages/engine/tests/browser/effect-samples.html`.
