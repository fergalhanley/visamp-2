# Input testing samples (Visript 5.0)

Open these scripts in the editor preview or main player, then click the canvas to
focus keyboard/scroll input. Escape releases focus. No audio or assets required.

| Script | Live checks |
|---|---|
| 01 Pointer orbits | Hover tracking; primary/secondary held state; Shift reversal |
| 02 Drag observatory | 3D orbit; drag beyond canvas and release; cancel with Escape; scroll zoom; Space toggles spin without key-repeat toggling |
| 03 Button ledger | Down/up/click/cancel counts; primary+secondary chords; quick clicks; drag should not click; enter/leave indicator |
| 04 Scroll nebula | Vertical zoom, horizontal rotation; scrolling elsewhere still works; browser zoom remains available |
| 05 Keyboard pilot | Physical WASD/arrows, Shift boost; no movement while editing source; switching tabs/focus cannot leave movement stuck |
| 06 Key event pads | Key versus code values, repeat flag, indexed array updates; uppercase/keyboard-layout behavior |

Also test switching 2D ↔ 3D, recompiling, assets pending, and taking a thumbnail
while interacting. Capture must not increment event counters. Touch/pen should
support one active contact; additional contacts are deferred to VIS-110.

The owner-run SQL import and copies of the scripts are delivered under
`codexes_tmp/visript-input-samples/`. Set `sample_owner` at the top of `import.sql`
to your profile UUID (the SQL Editor usually has no `auth.uid()`). Imports are
private, use stable sample IDs, and skip existing IDs so rerunning preserves any
edits. No existing-script migration is needed or included.
