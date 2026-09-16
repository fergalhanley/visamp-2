# Migrating to engine 4.0

Tracking: [VIS-107](https://linear.app/visamp/issue/VIS-107).
The owner requested removal of the legacy audio globals following `audio::detect`.
See the [language migration guide](../../apps/docs/src/language/audio-migration.md)
for range conversions, sample lengths and changed analysis behaviour.

The engine no longer exports `set_audio_frame` or stores byte audio arrays. The
player's RAF sampler, `BeatDetector` export and byte-detector implementation are
removed. Hosts must use `set_audio_analysis` and serve the AudioWorklet module.
`clear_audio_frame` continues to reset normalized analysis and pending events.
The validator now uses version 2 normalized fixtures and a version 2 reference
script; version 1 assets are historical only.

## Prepare stored scripts

1. Export **all** `public.visualisations` rows from the selected database to a
   private JSON array containing `id`, `source` and `updated_at`, including drafts
   and private sources. Retain the original export.
2. Review and convert each source into `<id>.viscript` in a separate directory.
   Include unchanged sources. Preserve comments, strings, asset references and
   unrelated calculations. Account for aliases, scalar consumers and array lengths.
3. Build the matching native validator and prepare SQL:

   ```sh
   packages/engine/with-toolchain.sh cargo build --release --bin visamp-validate
   python3 packages/engine/scripts/prepare-v4-migration.py sources.json reviewed-sources /private/path/visript-v4
   ```

The preparer validates every reviewed file with engine 4.x and refuses missing or
extra IDs. It does **not** guess audio-unit conversions, rewrite source, or access
the database. Compilation is not proof of visual equivalence.

Generated `manifest.json`, `migrate.sql` and `rollback.sql` contain private source,
original timestamps and checksums. Keep them out of git. Files use restricted
permissions. Review the manifest and test representative converted visuals.

Forward SQL locks the table in a transaction. It refuses new or removed rows,
changed original source or changed original timestamps, and verifies readback.
Already-converted rows are accepted for idempotent reruns. It updates only source,
leaving metadata and normal triggers intact. Rollback restores original source
only while rows still contain the reviewed replacement; intervening source edits
abort the entire rollback. New rows do not prevent rollback.

## Apply and verify

As with 3.0, the owner runs the SQL against the selected database:

1. Pause editing/playback and retain a database backup.
2. Deploy matching engine and validator 4.0 builds.
3. Run the reviewed forward SQL. On a conflict, re-export and review; do not remove
   the guards or overwrite intervening edits.
4. Reload clients, then test homepage playback, editor saves, assets, and visuals
   with both music and silence. Adjust artistic sensitivity where needed.

For rollback, pause editing, apply the guarded rollback SQL, restore matching 3.1
engine/validator builds, then reload clients. Pushing `develop` does not deploy
production. Preparing the files does not apply the database migration.

SQL tests run in a disposable local database:
`python3 packages/engine/scripts/test-v4-migration.py`.
