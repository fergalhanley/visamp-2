# Migrating Visript to engine 3.0

Tracking: [VIS-105](https://linear.app/visamp/issue/VIS-105).
The owner chose a **clean syntax break**, without legacy parameter aliases.
The language remains Visript and the file extension remains `.viscript`.

## Changed parameters

| Calls | Old | New |
| --- | --- | --- |
| `draw::rect`, `cube`, `sprite` | `w`, `h` | `width`, `height` |
| `draw::plane` | `w`, `d` | `width`, `depth` |
| `draw::cube` | `d` | `depth` |
| `draw::ellipse` | `rx`, `ry` | `radius_x`, `radius_y` |
| `draw::text` | `text` | `content` |
| `draw::torus` | `tube` | `tube_radius` |
| `draw::rect`, `ellipse`, `polygon` | `rotate` (radians) | `rotation_rad` |
| 3D draw calls | `rot_x`, `rot_y`, `rot_z` (degrees) | `rotation_x_deg`, `rotation_y_deg`, `rotation_z_deg` |
| 3D draw calls | `rot_x_rad`, `rot_y_rad`, `rot_z_rad` | `rotation_x_rad`, `rotation_y_rad`, `rotation_z_rad` |
| `math::sin`, `cos`, `tan` | `radians` | `rad` |
| `color::rgb`, `hsl` | `transparent: expression` | `a: 1.0 - (expression)` |
| Outline/line primitives | `stroke_weight` | `stroke_width` |

2D rotation also accepts `rotation_deg`. Supplying both units for an angle is
an error. RGB/HSL alpha defaults to `1.0`; scalar constructors clamp it to `[0,1]`.
Dependent GPU fields retain their existing later clamping stage. The converter
inverts the original expression once; it does not invert shape `opacity`, filter
`amount`, or identifiers named `transparent` in user functions.

## Source converter

From the repository root:

```sh
pnpm --filter @visamp/engine exec ./with-toolchain.sh cargo build --release --bins
target/release/visamp-migrate-v3 < old.viscript > new.viscript
```

Use a different output file to avoid truncating the input. The converter parses
old syntax, patches builtin argument spans, then validates the result with 3.0.
It preserves comments, strings and user argument names, rejects duplicate or
conflicting migrated names, and is idempotent. Keep the original files for rollback.
Compilation is not runtime or visual equivalence testing.

## Preparing database SQL

Export the **selected database's** `visualisations` rows with `id`, `source` and
`updated_at` to a private JSON array. Include drafts and private visualisations.
Then run:

```sh
python3 packages/engine/scripts/prepare-v3-migration.py sources.json /private/path/visript-v3
```

This creates restricted-access `manifest.json`, `migrate.sql` and `rollback.sql`.
The manifest/SQL contain original and replacement source; keep them out of git.
The tool itself performs no database reads or writes. Review the generated source
changes and validate/render representative scripts before applying.

The generated forward SQL:

- Uses a transaction and table lock so concurrent saves cannot race the checks.
- Aborts the whole operation if an expected row is missing or an original source
  or `updated_at` has changed. Regenerate from a fresh export on conflict.
- Treats already-migrated sources as complete, making reruns idempotent.
- Updates only `source`; normal asset-reference and timestamp triggers run.
- Checks readback before committing.

Rollback is generated from the same manifest, restores only rows still containing
the migrated source, and aborts on other source changes. It leaves metadata alone.
Back up the database as well as retaining the generated files before the release.
The SQL must run with sufficient access to all selected rows; partial RLS access
will cause the missing-row guard to abort rather than silently skip records.

## Release order

This is a coordinated release, not an online alias migration:

1. Stop editing/playback while changing the engine, server validator and sources.
2. Deploy matching engine and validator 3.0 builds.
3. Run the reviewed `migrate.sql` against the selected database.
4. Reload clients so old tabs cannot save old syntax. Verify playback, editor
   saves and AI-generated scripts, then resume use.

For rollback, stop editing again, run the guarded rollback SQL and restore the
matching 2.x engine/validator. A push to `develop` alone does not deploy production.
The SQL files are provided for the owner to run; no production release or database
mutation is performed by the preparation step.
