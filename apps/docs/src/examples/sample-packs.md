# Sample packs

The repository contains complete `.viscript` files for hands-on testing. Open a
file, paste it into the Visamp editor, and save it as a visualisation. Each pack's
README explains its controls and any asset setup.

| Pack | What to try | Repository path |
| --- | --- | --- |
| Drawing | Calendar clock, gradients, paths, 3D ribbons and overlays | `packages/engine/examples/drawing/` |
| Effects | Kaleidoscope, swirl, geometric pixelation, bloom and feedback | `packages/engine/examples/effects/` |
| Input | Pointer motion, dragging, button events, scrolling and keyboard controls | `packages/engine/examples/input/` |

The displacement example needs an uploaded bitmap; follow the effects README
and replace its asset reference with your own library ID. Other model or bitmap
references likewise need assets available to your account.

Each pack also includes an `import.sql` for a database administrator to load a
collection for testing. Read the accompanying README and set the intended owner
before importing. Ordinary creators can use individual script files without SQL.

For examples you can copy directly from this site, start with
[basic drawing](basic.md), [animation](animation.md), and [3D](3d.md).
