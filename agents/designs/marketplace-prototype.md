# M1 Studio + marketplace prototype

Status: active design for M1 only.

## Goal

Prove one integrated artist workflow:

`My Videos → Video Maker → owned track → eligible visual → customise params → license product if required → export → My Videos`.

The visual marketplace supplies Video Maker; it is not a separate artist experience.

## Studio

Studio has two primary tabs.

### My Videos

The artist's durable workspace for authored output.

M1 needs:
- list existing videos;
- create a video;
- open/edit a video;
- preview a video;
- show distribution/scheduling state;
- receive newly exported videos from Video Maker.

Detailed campaign scheduling/publishing mechanics can remain later work; the data model must have a place for that state now.

### Video Maker

Derived from the existing set-builder/timeline rather than the temporary marketplace audition page.

Differences from the general set builder:
- audio catalogue contains only tracks controlled by the signed-in artist;
- visual catalogue contains only visuals whose distribution class permits video use;
- visual clips surface the visual's params;
- product visuals can be previewed before purchase but require a licence before final export/distribution;
- output is a Video entity owned by the artist, not a performance set.

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
- discoverable in Video Maker/marketplace;
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
- Studio derives the musician-facing controls from declared params rather than exposing arbitrary props;
- the engine/host will also provide a reserved standard parameter set; exact standard names are defined separately before Video Maker integration.

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

## Video persistence

A Video is a durable Studio object, separate from performance sets.

It stores enough authoring state to reopen Video Maker, including:
- owned track references/timing;
- visual references/timing;
- param values per visual use;
- licence/provenance references;
- output format/aspect ratio;
- distribution and scheduling state;
- generated/exported asset references.

The existing set model/timeline is implementation leverage, not the final Video data model.

## Export

M1 requires one usable promotional video from the authored Video Maker project, with track audio and visual output, and the result must appear in My Videos.

## Deliberately outside M1

- full campaign generation;
- social platform publishing implementation;
- creator cash payout execution;
- subscriptions/auto-top-up;
- exclusive licences;
- Visamp network discovery;
- livestream/TV;
- MCP exposure.
