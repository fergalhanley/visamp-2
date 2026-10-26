# LFO Phase 2 — editor and persisted visualisation defaults

Phase 1's deterministic Rust/WASM configuration is unchanged. The editor uses
`VisampCanvas.modulation`, never source rewriting or post-render transforms.

The optional visualisation-owned `modulation` JSONB column stores a version 1
bank. A `null` value means no modulation for legacy visualisations. Invalid
stored JSON is ignored in playback, with the source still running. The editor's
existing throttled autosave carries the bank beside the source, and forks
inherit the saved bank. The public player receives the validated configuration.

Creators use the bottom inspector's Modulation tab for four LFOs, waveform
previews, BPM, beats/bar, phase, cycle length, polarity and seeded random.
Numeric `prop` entries in the Properties tab can be assigned an LFO with a
range, bypassed or removed. Base values are never mutated. Display-side
effective-value estimates use a preview clock and are *not* a read-back of the
engine's actual frame time; playback and export use the engine clock.

Database deployment: apply
`supabase/migrations/20261026113000_visualisation_modulation.sql` to the
target Supabase project before using the editor in that environment. Merely
merging the code does not apply a database migration. The current client-side
validation complements, but does not replace, engine validation.
Phase 3 VJ performance overrides, MIDI, keyboard and presets remain excluded.
