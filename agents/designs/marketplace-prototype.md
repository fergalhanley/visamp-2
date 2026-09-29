# M1 Studio + marketplace prototype

Status: active design. The Set-based direction below supersedes the separate
My Videos / Video Maker authoring model from earlier on 2026-09-29.

## Goal

`Set Builder → author a Set → Studio → select the Set for distribution → validate rights → license products if needed → render/export → manage outputs`.

## Authoring and distribution

Set Builder is the authoring UI, using the existing editor, timeline, transport,
preview, clip properties and persistence. Do not build another timeline editor
inside Studio or require a separate Video authoring project.

Studio is the workspace for selecting the user's existing Sets for distribution
and managing their rendered outputs. It links directly to the existing Set
Builder for creating, editing and previewing Sets. Social-account connections,
distribution scheduling and publishing belong in Studio when M5 is implemented.
The navigation layout for those later capabilities is not fixed by M1.

The owner explicitly chose direct Set distribution: the Set remains the source
project. Renders and distribution records refer to it. A render must eventually
pin the Set revision/content and provenance used to create it, so later Set
edits cannot silently change an existing output, licence snapshot or scheduled
publication. Selecting a Set does not itself render, license or publish it.

Performance authoring can retain its existing media support. Distribution
requires artist-controlled hosted audio and eligible public/protected/product
visuals. Validate these rules below the UI before rendering or distribution;
being playable in Set Builder does not imply distribution rights. Surface
ineligible references so the artist can repair the Set in the same editor.

M1 extends Set Builder only where needed: declared params stored per visual
clip, eligible visual discovery/preview and the output settings required for
one practical promotional render. Existing performance behavior is preserved.

## Visual distribution classes

### private
- visible only to creator;
- source editable by creator;
- not usable by other artists.

### public
- discoverable;
- source visible;
- forkable;
- free to use in videos, including commercial promotional output;
- creator attribution retained.

### protected
- discoverable and usable in videos like public;
- source not exposed through Visamp product UI/API;
- not forkable;
- free to use commercially;
- params may be customised.

### product
- discoverable in Set Builder/marketplace;
- source not exposed through Visamp product UI/API;
- not forkable;
- preview permitted;
- final video/export/distribution requires a paid licence;
- customisation only through params.

Because Visript currently executes client-side source, true source secrecy for protected/product ultimately requires an opaque compiled/serialized execution representation. M1 must enforce no source UI/API and no fork; opaque delivery is follow-up hardening rather than pretending browser-delivered source can be secret.

## Visript state vs params

### `prop`

`prop` is creator-owned mutable runtime state.

```visript
prop phase = 0.0

on_frame {
  phase += 0.01
}
```

The script can read and write it.

### `param`

`param` is host/musician-controlled input with a creator-supplied default.

```visript
param HELLO = "hello"
param VALUE_INT = 123
param INTENSITY = 0.7
```

Rules:
- declared at top level like `prop`;
- param identifiers use `UPPER_SNAKE_CASE`; built-in/default params follow the same convention so immutability is visually obvious;
- readable anywhere a normal identifier is readable;
- immutable from Visript: assignment, compound assignment, increment/decrement and indexed mutation are rejected;
- writable only through the engine host boundary;
- a new script load restores the creator's declared defaults;
- Set Builder derives the musician-facing controls from declared params rather than exposing arbitrary props;
- the engine/host will also provide a reserved standard parameter set; exact standard names are defined separately before Set Builder integration.

This is a deliberate language-level contract, not a Studio convention.

## Runtime contract

The engine exposes `set_param(name, value)`.

- creator-defined params may be set by name;
- standard host params use the same read semantics;
- the incoming value must match the param's declared type;
- unknown params or invalid values return an error and leave the running visual unchanged;
- props cannot be changed through this API;
- runtime customisation does not mutate creator source.

The engine also exposes param metadata/current values so Studio can build controls without parsing or revealing source.

## Product pricing and licensing

Only `product` visuals require a paid visual licence.

A product licence is bound to:
- purchaser user;
- artist-owned track/video;
- visualisation;
- creator;
- price paid;
- creator share;
- Visamp share;
- chosen param values;
- purchase timestamp.

Public/protected visuals require attribution/provenance but no marketplace charge.

A repeat product purchase for the same intended licensed unit should not charge twice unless the commercial model explicitly changes later.

## Credits and creator earnings

Reuse the existing prepaid credit allocation system.

Product purchase must be atomic:
1. verify purchaser controls the music/video;
2. verify visual is a product and has a price;
3. lock purchaser credit balance;
4. debit allocations;
5. create the visual licence with param snapshot;
6. record Visamp share and creator earning.

Creator earnings remain a separate non-spendable ledger. Cash payout mechanics are post-M1.

## Persistence and transition

`performance_sets` is the existing durable authoring store. Keep it and the
`/sets/[setId]/edit` route as the canonical project/editor. Studio selections
are lightweight Set references, not copies of authoring content. Render and
distribution records attach to Set IDs with immutable render-time snapshots.

The interim `videos` table, Video authoring APIs and VideoMaker component already
exist. Preserve existing drafts and migrations while retiring that UI from
Studio. Do not erase them or silently reinterpret them as performance Sets.
Before retiring their API/storage, provide an explicit draft conversion path
that retains timing, params, attribution and any licence references. No new
separate Video authoring workflow should be built.

Reuse useful validation, param, licensing and export code from the interim
Studio implementation. The older `/api/studio/visuals` response still delivers
runtime source; enforcing the product source/fork boundary remains open.

## Export and licensing

M1 needs one usable promotional render from a selected Set, including its track
audio and visuals, visible in Studio with source-Set and licence provenance.
Product visuals require server-validated licences before final export. A
client-stored licence ID is provenance, not authorisation. Preserve the existing
track/visual licence unit unless a deliberate commercial decision changes it.

## Deliberately outside M1

- social-account connection and platform publishing implementation;
- scheduling execution and full campaigns;
- creator cash payouts, subscriptions and auto-top-up;
- exclusive licences, Visamp network discovery, livestream/TV and MCP.

## Current Studio selection implementation

`StudioShell` lists owner-scoped Sets and persists selection through
`/api/studio/sets`. `studio_sets` stores only the Set ID and selection timestamp;
its primary key makes selection idempotent and its foreign key prevents orphan
selections. The API checks ownership before writes and RLS protects owner reads.
The service never creates a Video or copies Set content when selecting.

Create/edit/preview links use `/sets/new` and `/sets/[setId]/edit`. The standalone
VideoMaker and MarketplaceStudio components are no longer mounted by Studio.
Selected Sets currently await export; no scheduling, publication or licence
status is fabricated. Export and distribution state will be added with their
actual services.

`20260929170000_studio_set_selection.sql` is applied locally and still needs
application to the remote database. Verified with SQL ownership/idempotency/
reference tests, API and component tests, browser selection/reload fixtures,
web type check, lint and production build. The full authenticated browser →
licence → render workflow remains an open M1 task.

### Distribution migration dependencies

`20260929143000_visual_distribution_classes.sql` preserves the original shared
enum as `asset_visibility` for assets, which remain public/private. Visualisations
alone receive the four-class `visibility` enum. Timestamp and asset-sync triggers,
the asset-reference read policy, and public/preferred-track indexes are removed
before the column type change and restored afterward with their existing scope.
Verified against local PostgreSQL 17, including `visual_distribution_classes.sql`
and the existing `assets_access.sql` regression tests. Remote application is
separate from this local verification.

### Three-column Studio / Master Downloads setup

The owner refined Studio to one full-width workspace: all owned Sets on the
left (search, updated-date/name ordering, status filter), distributions for the
active Set in the centre, and settings/status for the active distribution on
the right. Set Builder remains the authoring and preview UI.

`set_distributions` stores one draft Master Downloads setup per Set, with
filename, container, resolution and frame rate. `/api/studio/distributions`
provides owner-scoped list/add; `/api/studio/distributions/[id]` saves validated
settings with an `updated_at` concurrency check. Repeat add preserves settings.
RLS permits owner reads; writes go through the authenticated service. Set
deletion cascades. Existing `studio_sets` selections remain visible in filters;
a distribution draft is itself selection for distribution.

The owner explicitly chose saved setup/settings first. These output preferences
are not a claim of render support or export eligibility: full Set rendering,
licensing/readiness checks, provenance and downloads remain open M1 work. Social
targets are listed but disabled. When individual channels are implemented, their
selection should start account connection if needed; no account is required for
Master Downloads. Unsaved settings survive Set switches and failed saves in the
current page, with a warning before leaving.

Apply `20260930010000_studio_distributions.sql` after the existing migrations.
It has been applied and tested locally, not remotely. Verification covers SQL
ownership/constraints, API ownership/validation/concurrency, component state,
and the real dropdown/layout with isolated browser API fixtures. Authenticated
remote browser-to-database verification remains part of the open M1 flow task.
