# M1 marketplace prototype

Status: active design for M1 only.

## Goal

Prove the transaction:

`artist track → audition creator visual → customise exposed controls → license with credits → export promotional video → creator earning`.

Do not expand this milestone into campaigns, social publishing, payouts or the public Visamp network.

## Audit of reusable code

### Already reusable

- Artist identity, self-claiming and MP3 upload flows already exist.
- Hosted tracks already have playback APIs and can be selected in the player.
- Public/private creator visualisations, attribution, thumbnails and creator profiles already exist.
- The player already combines hosted audio with arbitrary visualisations.
- Visript already has top-level mutable `prop` values and a property inspector.
- The engine already exposes frame capture and a controllable animation timeline.
- Prepaid credit allocations, Stripe purchases, balances and transaction history already exist.

### Material M1 gaps

- No creator-defined marketplace control metadata.
- No runtime API for an external UI to set a Visript property without rewriting source.
- No marketplace price/listing state on a visualisation.
- No artist-facing flow for auditioning many visuals against one selected track.
- No visual licence record tied to an artist-owned track.
- No atomic marketplace credit debit and Visamp/creator split.
- No creator earnings ledger.
- No track + visual video export pipeline.

## Prototype product model

For M1, a marketplace product is a published Visamp visualisation with optional marketplace metadata. Do not create a parallel visual-product entity until the model requires multiple commercial variants of one visual.

A listed visual has:

- visualisation id and immutable creator attribution;
- price in Visamp credits;
- a list of creator-exposed controls;
- listing enabled/disabled state.

A control describes a top-level Visript `prop` and how Studio may edit it. Initial control kinds:

- number: label, min, max, step;
- boolean: label;
- colour: label;
- text: label.

The visual remains the source of truth for the property's initial/default value. Marketplace control metadata only declares which properties a musician may change and UI constraints for changing them.

## Runtime contract

The engine must expose a safe `set_property(name, value)` boundary.

- Only declared top-level `prop` values may be changed.
- The incoming value must match the property's Visript type.
- Invalid names/values return an error and leave the visual unchanged.
- A new script load restores script defaults.
- Runtime customisation does not mutate the creator's source.

This allows Studio, API and future MCP clients to apply the same customisation without rewriting Visript.

## Licence model

A prototype licence is bound to:

- purchaser user;
- artist-owned track;
- visualisation;
- creator;
- price paid;
- creator share;
- Visamp share;
- chosen control values;
- purchase timestamp.

The licence permits generated promotional output for that track under the marketplace terms. M1 does not implement exclusivity or transfers.

A repeat purchase of the same visual for the same track should return the existing licence rather than charge twice unless the commercial model is deliberately changed later.

## Credits and creator earnings

Reuse the existing prepaid credit allocations as the balance system.

Marketplace purchase must be one database transaction:

1. verify purchaser owns/controls the track through its claimed music artist;
2. verify visual is public and listed;
3. lock purchaser credit balance;
4. debit allocations;
5. create the visual licence;
6. record Visamp share and creator earning.

Creator earnings are a separate non-spendable ledger. They are not simply added to the creator's Visamp credit balance.

For the M1 prototype use a fixed platform percentage in server/database configuration. Payout mechanics are post-M1.

## Preview flow

M1 artist flow:

1. choose/upload one owned track;
2. browse listed visuals while that track keeps playing;
3. selecting a visual changes the visual but not the track;
4. exposed controls appear for that visual;
5. changing a control updates the running visual immediately;
6. purchase confirms credit price;
7. successful purchase unlocks export for that track/visual/customisation.

## Export

M1 requires one usable vertical promotional video from the licensed pairing.

Target first format: 9:16, with track audio, suitable for short-form social use. Exact duration and capture implementation can be decided in the export task; do not block marketplace work on a general-purpose editor.

## Deliberately outside M1

- campaign generation;
- social account connections and scheduling;
- creator cash payout execution;
- subscriptions/auto-top-up;
- exclusive licences;
- Visamp network discovery;
- livestream/TV;
- MCP exposure.
