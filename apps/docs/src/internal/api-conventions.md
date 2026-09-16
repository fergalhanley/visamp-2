<!-- audience: internal -->

# API contributor conventions

Visript is the language; `.viscript` is its standard source extension. VisAmp is
its host application. This guide is for authors and contributors extending the
language. It records the conventions for engine 3.0 and requirements for new APIs.

The [September 2026 consistency review](https://github.com/fergalhanley/visamp-2/blob/develop/packages/engine/reviews/2026-09-language-consistency.md)
records the audit and accepted migration. Engine 3.0 deliberately removes the
old parameter spellings; see the migration guide in the engine repository.

## Names

- Use `snake_case` for namespaces, functions, parameters, properties and locals.
  Examples: `draw::point_cloud`, `camera::look_at`, `refresh_color`, `orbit_speed`.
  Existing mixed-case user identifiers remain legal; do not rewrite users' locals.
- Use `$UPPER_SNAKE_CASE` for host values and constants, such as `$TIME_SEC` and
  `$POINT_INDEX`. Document where each value is available.
- Use a namespace for a coherent domain: `draw`, `math`, `color`, `asset`,
  `camera`, `transform`, `light`, `gfx`, `effect`, `array`.
  Audio snapshot getters live in `audio::detect` and use `get_` names.
- Constructors and draw operations name the thing they create (`rgb`, `circle`);
  actions name the operation (`translate`, `rotate_x`, `look_at`). State setters
  may name the state (`camera::position`, `gfx::blend`). Do not add `set_` to every
  existing function just to make these categories look alike.
- Prefer full descriptive parameter names. Keep conventional coordinates and
  channels (`x`, `y`, `z`, `r`, `g`, `b`, `h`, `s`, `l`), standard math names
  (`sin`, `atan2`, `sqrt`, `ln`) and established technical terms (`uvs`, `id`).
- For new dimension parameters, prefer `width`, `height`, `depth`, `radius_x`,
  `radius_y`, `tube_radius`. `size` means a documented uniform size or diameter,
  not an unspecified substitute for every dimension.

## Parameters, units and defaults

All calls use named arguments. Show arguments in a predictable order: required
inputs, position, dimensions, orientation, appearance, advanced options.

For new angle parameters, use `rad`/`deg` when the call already names the angle,
or a descriptive name with `_rad`/`_deg` (for example `rotation_x_deg`). Never
introduce a new angle whose units are implicit. Reject simultaneous alternatives.
Use `rotation_rad`/`rotation_deg` for 2D shape rotation and
`rotation_x_rad`/`rotation_x_deg` (and Y/Z equivalents) for 3D orientation.
Trigonometric inputs use `rad`.
Trigonometric inverse functions return radians; HSL hue remains a normalized turn.

Colour constructors use `a` for alpha: `0` is transparent, `1` is opaque, default
`1`. Shape-level `opacity` and filter `amount` remain separate controls.
The removed `transparent` parameter had the opposite direction; migrate its
value with `a: 1.0 - (old_expression)`.

Use `stroke_width` for outline thickness controls. Give every parameter a type, unit, default, range, and policy for
out-of-range/non-finite values. Explicitly state pixels versus world units,
coordinate origin, rotation pivot and winding where relevant.

Counts and indices should require integers in new APIs. Geometry tessellation
currently rounds and clamps some numeric inputs; do not silently change that
behaviour. Rounding a float and converting to an integer are separate operations:
`math::floor` returns a float today, while integer division (`\`) returns an integer.

Prefer neutral defaults for optional styling. Require meaningful structural
inputs rather than making an omitted operand silently become zero. Existing math
and colour defaults are exceptions; changes need a separate compatibility review.

## Validation contract for new features

- Reject unknown namespaces, function names, argument names, duplicate arguments,
  conflicting aliases and invalid enum values. Existing validation has gaps;
  these are contribution requirements, not a claim about all current calls.
- Validate structure and literal mistakes at compile time. Validate computed
  types/ranges at runtime. Report the call, argument, expected value and source
  location. Distinguish missing input from explicitly supplied invalid input.
- Evaluate each supplied argument once, in a documented order. Avoid different
  precedence rules between CPU drawing, scene construction and GPU point fields.
- State whether a call is an expression or statement and which lifecycle blocks,
  rendering contexts and overlay modes support it. A signature must not promise
  rendering support that the backend does not implement.
- Keep semantics consistent between scalar CPU evaluation and dependent GPU
  fields. Document supported-expression restrictions and precision differences.
- Support trailing commas in new argument/array lists. Colour and asset
  constructors currently have grammar exceptions.

## Contributor checklist

A language feature spans more than the parser. Review:

1. Grammar, AST and builtin signatures, including required inputs and conflicts.
2. Resolver diagnostics and CPU runtime behaviour.
3. GPU field compiler, renderer and resource limits where applicable.
4. Editor language support, AI generation references, native validator and WASM.
5. Reference tables and compilable examples, including defaults and units.
6. Tests for valid use, misspellings, duplicates, invalid types, boundaries,
   context restrictions and CPU/GPU parity where applicable.
7. Version/compatibility policy and stored-source impact before changing old APIs.

Renames require a stated compatibility policy and syntax-aware source migration.
For engine 3.0 the owner chose a clean break: legacy names are errors. Coordinate
the engine, server validator and saved-source migration in one release window;
reload old editor tabs to prevent them saving outdated syntax.

## Input library

Use `input::<device>::state::<getter>` for persistent state and
`input::<device>::event::<getter>` for the current event payload. Use `get_*` for
values and `is_*` for booleans. Event-only access requires the corresponding
`on_input_<device>_<event>` handler; helpers inherit that context at runtime.
Scroll is an event-only domain. Document units, neutral state, ordering, focus,
cancellation and host policy for every new channel. See [Input detection](../programming/input-detection.md).
