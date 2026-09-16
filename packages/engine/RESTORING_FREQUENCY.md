# Restoring byte frequency response (4.1)

Tracking: [VIS-108](https://linear.app/visamp/issue/VIS-108).

The owner requested the original analyser response and explicitly authorised
replacing their intervening database source experiments with the backed-up scripts.
`audio::detect::get_frequency()` returns 1,024 integer values in 0–255, using the
same native browser byte-frequency analysis as the old global. It does not scale
`get_spectrum()`, which retains its existing linear-amplitude contract.

The host calls `set_audio_frequency` once per animation frame. The engine caches
and latches immutable integer arrays before `on_frame`. Audio-thread analysis and
beat/onset event latching remain independent. Hosts use FFT 2,048, −100…−30 dB,
and smoothing 0.8. `clear_audio_frame` resets both analysis snapshots.

## Prepare a restore

1. Retain the pre-4.0 `manifest.json`. Its `source` fields are the originals;
   its `replacement` fields are the discarded linear-spectrum conversion.
2. Export all current `visualisations` rows (`id`, `source`, `updated_at`) into a
   separate private JSON file. These revisions guard forward SQL and are retained
   as the rollback destination, even though the owner chose to discard their edits.
3. Build engine 4.1 and run:

   ```sh
   packages/engine/with-toolchain.sh cargo build --release --bin visamp-validate
   python3 packages/engine/scripts/prepare-frequency-restore.py original-manifest.json current-snapshot.json /private/path/frequency-restore
   ```

The tool verifies original checksums and matching inventories, changes only code
tokens, preserves frequency arithmetic, and compiles every replacement. Two
reviewed exceptions retain the earlier waveform-bar conversion (signed PCM,
eight samples per bar) and the missing `beatIndex = -1` declaration fix. Other
waveform-dependent originals require review instead of a guessed conversion.

`provenance.json` links backup, current and replacement checksums. `manifest.json`
contains current/replacement sources. SQL uses the existing whole-inventory,
revision and readback guards. A fresh export accepts the owner's existing edits
as the state to replace; edits made after that export still abort the transaction.

The files are private and uncommitted. The owner runs the new `migrate.sql` with
matching engine/validator 4.1 builds, then reloads clients. It supersedes the earlier
4.0 migration. Rollback restores the current experimental sources captured at
preparation time, not the pre-4.0 globals. No live database writes or release are
performed by the tool. Test restored visuals with their real assets and music.
