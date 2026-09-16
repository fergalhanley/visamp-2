# Visript consistency review — September 2026

Tracking: [VIS-104](https://linear.app/visamp/issue/VIS-104).
Baseline: engine 2.6.0, develop `765d82a`. Status: recommendations for review;
no language behaviour or stored source has been changed in this audit.

The [conventions guide](../../../apps/docs/src/language/conventions.md) gives
contributors a consistent target. Existing syntax remains supported until an
explicit implementation/migration decision. Visript and `.viscript` are confirmed
names, not proposals.

## Recommended first pass: names and aliases

| Current spelling | Proposed canonical spelling | Reason / migration |
| --- | --- | --- |
| `draw::rect(w:, h:)`; cube/sprite `w:, h:`; cube/plane `d:` | `width`, `height`, `depth` | Rect already accepts long names, other shapes do not. Keep `size` as uniform sizing with documented precedence. |
| `draw::ellipse(rx:, ry:)` | `radius_x`, `radius_y` | Already accepted aliases; make long names canonical. |
| `draw::text(text:)` | `content` | Already accepted; choose the spelling used in the reference. |
| `draw::torus(tube:)` | `tube_radius` | Names the measured quantity, not just the object. |
| 2D `rotate:` | `rotation_rad` (plus `rotation_deg`) | Current value is radians. Rename alone preserves its unit. |
| 3D `rot_x`, `rot_y`, `rot_z` | `rotation_x_deg`, `rotation_y_deg`, `rotation_z_deg` | Current unsuffixed values are degrees, unlike 2D `rotate`. |
| 3D `rot_x_rad`, etc. | `rotation_x_rad`, etc. | Consistent descriptive stem and explicit units. |
| `math::sin/cos/tan(radians:)` | `rad` | Matches `transform::rotate_x(rad:)` and filter hue rotation. Keep inverse trig results in radians. |
| `color::rgb/hsl(transparent:)` | `opacity` | Current value means transparency, not opacity. Requires inversion, not just relabelling. |
| `stroke_weight` | `stroke_width` | Consistent name for geometric thickness across circles, ellipses, rectangles and lines. |

Keep established names such as `rect`, `sin`, `sqrt`, `gfx`, channel letters,
`look_at`, `point_cloud`, `model` and `mesh`. Renaming every abbreviation would
cause churn without resolving ambiguity. `asset::model(id:)`, `draw::model(asset:)`
and `draw::point_cloud(model:)` have distinct roles and do not need a rename.

Defer `resolution` / `segments` / `subdivisions`: they measure related but different
things. Sphere resolution is not automatically equivalent to every other mesh's
segment count. Likewise, line endpoints (`x1/y1/x2/y2`) and gradient endpoints
(`x0/y0/x1/y1`) differ; consider `start_x/start_y/end_x/end_y` in a later pass.

Evidence: [builtin signatures](../src/builtins.rs),
[scalar and drawing evaluation](../src/interpreter.rs),
[point-field compiler](../src/points.rs).

## Higher-priority correctness findings

These should be tracked as separate behavioural fixes rather than hidden in a
naming migration.

### 1. Duplicate and unknown arguments are not consistently rejected

The native validator accepts both:

```visript
render {
  draw::circle(radius: 1, radius: 2)
  let n = math::sin(radians: 0, radians: 1)
}
```

Canvas 2D iterates arguments and overwrites values, so the last radius wins.
`ArgReader::raw`, math and colour expressions use the first matching argument.
Only `array::filled` has an explicit duplicate check. Alias pairs can also
conflict, e.g. `width` and `w` in one rectangle.

Unknown user-function arguments are ignored; this compiles and uses `x`'s default:

```visript
fn f(x: 1) { return x }
render { let n = f(typo: 2) }
```

Unknown namespaces such as `drwa::circle()` also pass the resolver. Add common
argument validation and user-function resolution before selecting alias conflict
behaviour. Do not automatically rewrite ambiguous calls; preserve their baseline
behaviour or flag them for review.

### 2. Compile-time availability overstates renderer support

`context 3d render { draw::circle(radius: 1) }` compiles. The current
`record_draw` fallback reports that the promoted primitive is not rendered in 3D.
The shared `d2` signature builder also grants common 3D arguments to calls such
as `draw::clear`. Successful compilation does not imply the accepted argument has
an effect. Reconcile the resolver, backend and reference for each call/context;
do not promise universal shared arguments merely to simplify signature tables.

### 3. Invalid enums can silently select defaults

`gfx::blend(mode: "typo")` compiles and selects alpha blending at runtime.
Unknown `gfx::cull` and `shading` values also fall through to defaults. Missing
arguments may default; supplied invalid values should produce located errors.
Test both literals and computed strings.

### 4. Numeric contracts vary by execution path

- CPU math returns `Value::Float`, including `floor` and `trunc`. Ranges and
  array counts/indices require integer values. Geometry `ArgReader::count` instead
  rounds/clamps finite numbers and defaults non-finite values.
- CPU math defaults omitted operands to zero. Dependent GPU math requires its
  operands explicitly. Thus `math::atan2(y: $POINT_INDEX)` reaches different
  argument-default behaviour than an ordinary scalar `atan2(y: 1)`.
- CPU colour constructors clamp channels/transparency. The dependent RGB field
  compiler emits raw channel expressions and `1.0 - transparent`; the fragment
  shader clamps later, and HSL clamps saturation/lightness in its helper. Clamping
  at different stages matters for grid interpolation and non-finite values. Audit
  those cases before changing opacity.
- CPU `math::clamp` calls Rust's `f64::clamp` without guarding invalid bounds;
  a reversed or NaN bound can panic rather than return a Visript diagnostic.

Prioritize explicit numeric contracts and CPU/GPU regression tests. Do not make
`floor` return an integer incidentally during a rename: that would change typing
and requires its own decision.

### 5. Grammar and documentation disagree

- Functions, math calls and arrays allow trailing commas; colour constructors
  and asset references do not. Standardize parsing without changing asset-ID
  literal requirements or breaking the database asset-reference extractor.
- `identifier` permits leading digits. `prop 1foo = 2 render {}` compiles.
  Adopt conventional letter/underscore-first identifiers for new code; assess
  existing sources before tightening the grammar.
- Documentation says exactly one render block; the parser rejects a second but
  accepts zero (`prop x = 1`). Decide whether zero-render scripts are valid
  libraries/empty drafts before making them errors.
- Blocks reference says render cannot write properties; capture implementation
  explicitly handles property writes made by render. Preserve actual scripts
  when resolving this documentation mismatch.
- Lifecycle drawing calls are described as prohibited, but draw calls with
  `Target::none()` are skipped rather than rejected.
- Functions reference claims defaults define parameter types; runtime binds the
  supplied value without checking it against that default's type.
- Colour docs label `transparent` as opacity and include
  `fn rainbow_color(position)`, which is invalid because parameters require
  defaults. Function examples also mix camelCase with builtins' snake_case.

Evidence: [grammar](../visript.pest), [parser](../src/parser.rs),
[resolver](../src/resolver.rs), [capture code](../src/lib.rs),
[blocks reference](../../../apps/docs/src/language/blocks.md),
[functions reference](../../../apps/docs/src/programming/functions.md),
[colours reference](../../../apps/docs/src/drawing/color-constructors.md).

### 6. Signature information is distributed

`Builtin` records names, required parameters and context availability, but not
full types, defaults, ranges, enum alternatives or aliases. Math/colour/asset
constructors take separate grammar/resolver paths, and GPU fields repeat parts
of their signatures. This is why fixes to one path can miss another.

Extend shared metadata incrementally to cover aliases, types, defaults and enum
sets. Generate documentation/completion data from it where practical. A wholesale
parser rewrite is not necessary for the naming pass.

## Database impact (read-only snapshot, 2026-09-16)

The database configured in `apps/web/.env.local` contained **22** visualisations.
All **22** sources passed the current native validator. A lexical call/argument
inventory, excluding comments and string contents, found:

| Candidate | Scripts | Argument occurrences |
| --- | ---: | ---: |
| `radians` → `rad` | 20 | 130 |
| `transparent` → `opacity` | 17 | 20 |
| `stroke_weight` → `stroke_width` | 14 | 23 |
| Short dimensions → full names | 1 | 2 |
| Ellipse radius aliases, `text`, 2D `rotate`, 3D rotation (either unit), torus `tube` | 0 | 0 |
| Sphere resolution / gradient endpoints (deferred) | 0 | 0 |

The union is **21 affected scripts**, not the sum of the rows. No duplicate
argument occurrences were detected in this snapshot. Counts are advisory lexical
inventory, not a migration dry run or runtime/render validation. Re-read the
selected target database before applying anything; do not infer the deployment
environment from a local credential file. Private sources and credentials are
not included in this repository.

## Required migration procedure

1. Agree on the canonical name table and exact numeric semantics. Add aliases
   in the parser/resolver, scalar interpreter and GPU field compiler. Compile and
   render old/new fixtures in 2D and 3D; test nested expressions and asset calls.
2. Deploy compatible engine, editor/AI and validator together before migrating
   stored sources. A develop commit alone does not update deployed clients.
   Keep old spellings supported for existing tabs, imports and temporary files.
3. Select the target database explicitly. Export affected `id`, original source,
   `updated_at`, checksum and proposed replacement into a restricted backup and
   migration manifest. Retain the manifest outside git with the migration record.
4. Use parsed call/argument spans, not global string replacement. Patch only the
   intended builtin's argument labels; leave comments, strings, user parameters
   and asset IDs unchanged. For CPU transparency, preserve
   `1 - clamp(value, 0, 1)` when converting to opacity, evaluating the original
   expression once. Resolve GPU boundary semantics before applying that transform.
5. Validate baseline and replacement source with the target compiler. Review
   source diffs and render comparisons (including trails, point fields and model
   sprites). Compile success alone cannot prove visual equivalence. Flag ambiguous
   alias/duplicate cases and baseline failures instead of guessing.
6. Update each row only if its original source and revision/`updated_at` still
   match. Abort or report conflicts from concurrent saves. Update through the
   ordinary source path so asset-reference and timestamp triggers remain active.
   Preserve ownership, visibility, attribution, thumbnails and other metadata.
7. Read back, validate and record applied/conflicted counts. Re-running must make
   no further edits. Rollback must likewise compare against the migrated source
   before restoring the backup; never overwrite a subsequent user edit.
8. Re-scan after migration. Historical SQL migrations, immutable generation
   records and unrelated strings are not current editable visualisations. Audit
   any additional source-bearing tables before deciding to modify them.

No stored-source update is needed for this documentation-only audit. The proposed
language implementation and database migration remain pending the naming decision
and compatible deployment; they have not been represented as completed.
