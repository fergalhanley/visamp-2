# Assets

Images, vectors and 3D models you have uploaded can be drawn from a script:
a bitmap or SVG as a texture on any primitive, a model as geometry.

```
context 3d

render {
  draw::cube(texture: asset::bitmap("a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d"))
}
```

## Referring to an asset

| Call | What it names |
|---|---|
| `asset::bitmap("<id>")` | A PNG, JPEG or WebP upload |
| `asset::vector("<id>")` | An SVG upload |
| `asset::model("<id>")` | A GLB (binary glTF) upload |

The id is the asset's identifier from your library. Both spellings are accepted
and mean the same thing:

```
asset::bitmap("a1b2c3d4-…")
asset::bitmap(id: "a1b2c3d4-…")
```

**The id must be a literal string.** `asset::bitmap(my_variable)` is not valid,
and this is deliberate rather than an oversight. Visamp works out which visuals
use which asset by reading your source, and that is what makes it possible to
tell you when an asset you rely on has gone away. A computed id could not be
read that way, so the guarantee would be lost for everybody.

An `asset::` expression is a *reference*, not a picture. It does nothing on its
own — pass it to a draw call.

## Textures

`texture:` is accepted by every 3D `draw::` call and takes a `bitmap` or
`vector` reference.

```
context 3d

render {
  light::ambient(color: color::rgb(r: 0.6, g: 0.6, b: 0.6))
  draw::sphere(radius: 1.5, texture: asset::bitmap("a1b2c3d4-…"))
}
```

The texture **modulates** the shape's colour rather than replacing it, so
everything else still works the way you would expect:

```
// Tinted red, half transparent, still textured.
draw::cube(
  texture: asset::bitmap("a1b2c3d4-…"),
  color: color::rgb(r: 1.0, g: 0.2, b: 0.2),
  opacity: 0.5
)
```

Passing a `color` of white — the default — leaves the image untouched.

### How each primitive is wrapped

| Primitive | Mapping |
|---|---|
| `cube` | Each face gets the whole image |
| `sphere` | Equirectangular: `u` around, `v` pole to pole |
| `plane` | The whole image across the surface |
| `cylinder` | Around the side; the caps are mapped radially from their centre |
| `cone` | Around the side; the base radially |
| `torus` | `u` around the ring, `v` around the tube |
| `sprite` | The whole image on the quad |
| `mesh`, `model` | Whatever the geometry's own coordinates say |

A `draw::mesh` without `uvs` samples the image's top-left corner, which shows as
a flat colour rather than an error.

Images larger than 2048 pixels on their longest side are scaled down before
being sent to the graphics card. An 8192×8192 texture would cost 256 MB of video
memory, which is more than the whole visual is likely to have.

## Models

`draw::model` draws an uploaded GLB. It takes the same position, rotation,
colour, shading and `texture` arguments as any other 3D primitive.

```
context 3d

render {
  transform::rotate_y(deg: $TIME_SEC * 30.0)
  draw::model(asset: asset::model("f0e1d2c3-…"))
}
```

The whole model is loaded as one piece of geometry, with each part placed where
the file says it goes. Any textures the model file carries internally are not
applied — pass one with `texture:` if you want it textured.

Only `.glb` is accepted. A `.gltf` file normally points at separate texture and
buffer files sitting next to it, and Visamp has no way to store or keep track of
those, so a model has to be exported as a single self-contained file.

## When an asset will not load

A reference that cannot be resolved is **not an error, and does not stop the
frame**. A textured shape draws untextured; a `draw::model` draws nothing; the
rest of your script carries on.

That covers all of:

- the asset is still downloading, which is the usual case for a fraction of a
  second after a visual opens;
- the asset is private and belongs to someone else;
- the asset has been removed from availability.

The three are indistinguishable from inside a script, on purpose: a script must
never become a way to find out whether an asset exists or who owns it.

## Access

- Your uploads are **private by default** and only you can use them.
- Making one **public** lets anybody use it, including in exported video.
- Referencing an asset you cannot read does not give you access to it. It draws
  as though it were missing.
- A **public visual cannot reference a private asset**. Publishing one is
  refused, and names the assets that need making public first.

**Forks work exactly as you would expect and need no special handling.** A fork
keeps the source, so it keeps the references. Whether they load is decided for
whoever is watching: a fork of a visual using a public asset works for everyone,
and a fork can never reach a private one.

If an asset a published visual relies on is removed, the visual keeps rendering
without it and shows a warning.

## Formats and limits

| Kind | Accepted | Maximum size |
|---|---|---|
| Bitmap | `.png`, `.jpg`, `.jpeg`, `.webp` | 20 MB, 8192×8192 pixels |
| Vector | `.svg` | 2 MB |
| Model | `.glb` | 60 MB |

An account can store 300 assets totalling 1 GB.

SVGs are checked on upload and refused if they contain scripts, event handlers,
or references to anything outside the file itself — an uploaded vector has to
stand alone. If an SVG is rejected, exporting it as a plain shape drawing from
your editor usually resolves it.
