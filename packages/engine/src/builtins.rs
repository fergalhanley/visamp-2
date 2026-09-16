//! Signatures for the builtin `ns::name(args)` calls.
//!
//! These drive the compile-time argument checking in [`crate::resolver`]. They
//! are data rather than code so that a new primitive is one table row, and so
//! that the "did you mean" suggestions and the legality rules read off the same
//! source of truth the interpreter is written against.

use crate::model::ContextKind;

/// Which coordinate models a call is available in.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Availability {
    /// Legal in both 2d and 3d.
    Both,
    /// 3d only — using it in 2d is E3070.
    ThreeDOnly,
    /// Canvas 2D only — using it in 3d is rejected at compile time.
    TwoDOnly,
}

#[derive(Debug, Clone, Copy)]
pub struct Builtin {
    pub namespace: &'static str,
    pub name: &'static str,
    pub availability: Availability,
    /// Argument names accepted in any mode.
    pub args: &'static [&'static str],
    /// Extra names accepted only under `context 3d`; using one in 2d is E3071.
    pub args_3d: &'static [&'static str],
    /// Names that must be present, or E3021.
    pub required: &'static [&'static str],
    /// True for `draw::` calls that also accept the common 3d arguments (§6.6).
    pub takes_common_3d: bool,
}

/// Arguments that only exist under `context 3d`.
///
/// Named separately from the accepted-set logic because these earn the
/// dedicated E3071 message: an author writing `z:` in 2d has a specific
/// misunderstanding worth naming, rather than being told the argument does not
/// exist at all.
pub const PROMOTED_3D_ARGS: &[&str] = &[
    "z",
    "z1",
    "z2",
    "rotation_x_deg",
    "rotation_y_deg",
    "rotation_z_deg",
    "rotation_x_rad",
    "rotation_y_rad",
    "rotation_z_rad",
    "shading",
    "wireframe",
    "opacity",
];

/// The §6.6 arguments every `draw::` call accepts in 3d.
///
/// Position is deliberately *not* here. `draw::line` positions itself with
/// `x1`/`y1`/`x2`/`y2`, so a blanket `x`/`y` would make `draw::line(x: 1)` look
/// legal; the primitives that do take a centre list it themselves.
pub const COMMON_3D_DRAW_ARGS: &[&str] = &[
    "color",
    "shading",
    "wireframe",
    "opacity",
    // An `asset::bitmap` or `asset::vector` reference. Modulates the shape's
    // colour rather than replacing it, so tint and opacity still apply.
    "texture",
    "rotation_x_deg",
    "rotation_y_deg",
    "rotation_z_deg",
    "rotation_x_rad",
    "rotation_y_rad",
    "rotation_z_rad",
];

/// Pairs of argument names that mean the same angle in different units.
///
/// Supplying both in one call is E3010: there is no sensible way to reconcile
/// them, and silently preferring one would make the other look like it worked.
pub const ANGLE_PAIRS: &[(&str, &str)] = &[
    ("deg", "rad"),
    ("start_deg", "start_rad"),
    ("sweep_deg", "sweep_rad"),
    ("rotation_deg", "rotation_rad"),
    ("fov_deg", "fov_rad"),
    ("yaw_deg", "yaw_rad"),
    ("pitch_deg", "pitch_rad"),
    ("rotation_x_deg", "rotation_x_rad"),
    ("rotation_y_deg", "rotation_y_rad"),
    ("rotation_z_deg", "rotation_z_rad"),
];

const XYZ: &[&str] = &["x", "y", "z"];

pub const BUILTINS: &[Builtin] = &[
    // ── draw:: 2D, available in both modes ────────────────────────────────
    ns("draw", "clear", &[]),
    ns("draw", "background", &["color", "gradient"]),
    d2(
        "polygon",
        &[
            "points",
            "stroke",
            "stroke_width",
            "stroke_color",
            "line_cap",
            "line_join",
            "color",
            "gradient",
            "rotation_rad",
            "rotation_deg",
        ],
    ),
    d2(
        "circle",
        &[
            "x",
            "y",
            "radius",
            "color",
            "gradient",
            "stroke",
            "stroke_width",
            "stroke_color",
        ],
    ),
    d2(
        "rect",
        &[
            "corner_radius",
            "x",
            "y",
            "width",
            "height",
            "color",
            "gradient",
            "stroke",
            "stroke_width",
            "stroke_color",
            "rotation_rad",
            "rotation_deg",
        ],
    ),
    d2(
        "ellipse",
        &[
            "x",
            "y",
            "radius_x",
            "radius_y",
            "color",
            "gradient",
            "stroke",
            "stroke_width",
            "stroke_color",
            "rotation_rad",
            "rotation_deg",
        ],
    ),
    d2(
        "text",
        &["content", "x", "y", "size", "color", "gradient", "font"],
    ),
    // `line` gains z1/z2 rather than a separate draw::line3, and its
    // thickness becomes world units in 3d (§6.5).
    Builtin {
        namespace: "draw",
        name: "line",
        availability: Availability::Both,
        args: &[
            "x1",
            "y1",
            "x2",
            "y2",
            "color",
            "gradient",
            "stroke_width",
            "line_cap",
            "line_join",
        ],
        args_3d: &["z1", "z2"],
        required: &[],
        takes_common_3d: true,
    },
    Builtin {
        namespace: "draw",
        name: "image",
        availability: Availability::Both,
        args: &["asset", "x", "y", "width", "height", "opacity"],
        args_3d: &[],
        required: &["asset", "width", "height"],
        takes_common_3d: false,
    },
    path(
        "polyline",
        &[
            "points",
            "closed",
            "color",
            "gradient",
            "stroke_width",
            "line_cap",
            "line_join",
        ],
        &["points"],
    ),
    path(
        "bezier",
        &[
            "points",
            "color",
            "gradient",
            "stroke_width",
            "line_cap",
            "line_join",
        ],
        &["points"],
    ),
    path(
        "arc",
        &[
            "x",
            "y",
            "radius",
            "start_deg",
            "start_rad",
            "sweep_deg",
            "sweep_rad",
            "color",
            "gradient",
            "stroke_width",
            "line_cap",
        ],
        &["radius"],
    ),
    // ── draw:: 3D ─────────────────────────────────────────────────────────
    d3("cube", &["size", "width", "height", "depth"], &[]),
    d3("sphere", &["radius", "resolution"], &[]),
    d3("plane", &["width", "depth", "subdivisions"], &[]),
    d3("cylinder", &["radius", "height", "segments"], &[]),
    d3("cone", &["radius", "height", "segments"], &[]),
    d3(
        "torus",
        &["radius", "tube_radius", "segments", "tube_segments"],
        &[],
    ),
    ns3(
        "draw",
        "point_cloud",
        &[
            "count",
            "model",
            "x",
            "y",
            "z",
            "color",
            "size",
            "size_attenuation",
            "texture",
            "alpha_test",
        ],
        &[],
    ),
    ns3(
        "draw",
        "grid",
        &["columns", "rows", "x", "y", "z", "color"],
        &["columns", "rows"],
    ),
    d3("sprite", &["size", "width", "height"], &[]),
    d3(
        "mesh",
        &["vertices", "indices", "normals", "uvs"],
        &["vertices"],
    ),
    // Geometry from a stored model asset, as opposed to `draw::mesh`, which
    // takes its vertices inline. Separate rather than an extra argument on
    // `mesh` so that call keeps its "vertices are required" guarantee.
    d3("model", &["asset"], &["asset"]),
    // ── camera:: ──────────────────────────────────────────────────────────
    ns3(
        "camera",
        "perspective",
        &["fov_deg", "fov_rad", "near", "far"],
        &[],
    ),
    ns3("camera", "orthographic", &["height", "near", "far"], &[]),
    ns3("camera", "position", XYZ, &[]),
    ns3("camera", "look_at", XYZ, &[]),
    ns3("camera", "direction", XYZ, &[]),
    ns3("camera", "up", XYZ, &[]),
    ns3(
        "camera",
        "orbit",
        &[
            "target_x",
            "target_y",
            "target_z",
            "distance",
            "yaw_deg",
            "yaw_rad",
            "pitch_deg",
            "pitch_rad",
        ],
        &[],
    ),
    // ── transform:: ───────────────────────────────────────────────────────
    ns("transform", "push", &[]),
    ns("transform", "pop", &[]),
    ns("transform", "identity", &[]),
    transform("translate", &["x", "y"]),
    ns3("transform", "rotate_x", &["deg", "rad"], &[]),
    ns3("transform", "rotate_y", &["deg", "rad"], &[]),
    ns("transform", "rotate_z", &["deg", "rad"]),
    transform("scale", &["x", "y", "all"]),
    // ── light:: ───────────────────────────────────────────────────────────
    ns3("light", "ambient", &["color"], &[]),
    ns3(
        "light",
        "directional",
        &["x", "y", "z", "color", "intensity"],
        &[],
    ),
    ns3(
        "light",
        "point",
        &["x", "y", "z", "color", "intensity", "range"],
        &[],
    ),
    // ── gfx:: ─────────────────────────────────────────────────────────────
    ns3("gfx", "depth", &["enabled", "write"], &[]),
    ns("gfx", "blend", &["mode"]),
    ns3("gfx", "cull", &["mode"], &[]),
    ns3("gfx", "clear", &["color"], &[]),
    ns3("gfx", "overlay", &["enabled"], &[]),
    ns("effect", "scramble", &["type", "refresh_color"]),
    ns(
        "effect",
        "kaleidoscope",
        &["x", "y", "segments", "branches", "deg", "rad"],
    ),
    ns("effect", "swirl", &["x", "y", "radius", "deg", "rad"]),
    ns("effect", "pixelate", &["size", "gap", "gap_color"]),
    ns(
        "effect",
        "pixelate_rect",
        &["width", "height", "gap", "gap_color", "deg", "rad"],
    ),
    ns("effect", "pixelate_circle", &["size", "gap", "gap_color"]),
    ns(
        "effect",
        "pixelate_triangle",
        &["side_length", "gap", "gap_color", "deg", "rad"],
    ),
    ns(
        "effect",
        "pixelate_pentagon",
        &["side_length", "gap", "gap_color", "deg", "rad"],
    ),
    ns(
        "effect",
        "pixelate_hexagon",
        &["side_length", "gap", "gap_color", "deg", "rad"],
    ),
    ns(
        "effect",
        "pixelate_pentagram",
        &["size", "gap", "gap_color", "deg", "rad"],
    ),
    ns(
        "effect",
        "pixelate_hexagram",
        &["size", "gap", "gap_color", "deg", "rad"],
    ),
    ns("effect", "mirror", &["axis"]),
    ns("effect", "posterize", &["levels"]),
    ns("effect", "chromatic_aberration", &["amount", "deg", "rad"]),
    ns(
        "effect",
        "vignette",
        &["x", "y", "radius", "softness", "amount"],
    ),
    ns(
        "effect",
        "ripple",
        &["x", "y", "wavelength", "amplitude", "phase"],
    ),
    ns("effect", "scanlines", &["spacing", "amount", "deg", "rad"]),
    ns("effect", "bloom", &["threshold", "intensity", "radius"]),
    Builtin {
        required: &["map"],
        ..ns("effect", "displace", &["map", "amount"])
    },
    // ── effect::filter:: GPU post-processing (2D and 3D) ──────────────────────
    ns("effect::filter", "blur", &["radius"]),
    ns("effect::filter", "brightness", &["amount"]),
    ns("effect::filter", "contrast", &["amount"]),
    ns("effect::filter", "grayscale", &["amount"]),
    ns("effect::filter", "hue_rotate", &["deg", "rad"]),
    ns("effect::filter", "invert", &["amount"]),
    ns("effect::filter", "opacity", &["amount"]),
    ns("effect::filter", "saturate", &["amount"]),
    ns("effect::filter", "sepia", &["amount"]),
];

/// A 2D `draw::` primitive: legal in both modes, gains the promoted 3d args.
const fn d2(name: &'static str, args: &'static [&'static str]) -> Builtin {
    Builtin {
        namespace: "draw",
        name,
        availability: Availability::Both,
        args,
        args_3d: &["z"],
        required: &[],
        takes_common_3d: true,
    }
}

/// A 3D `draw::` primitive.
const fn d3(
    name: &'static str,
    args: &'static [&'static str],
    required: &'static [&'static str],
) -> Builtin {
    Builtin {
        namespace: "draw",
        name,
        availability: Availability::ThreeDOnly,
        args,
        // Every 3D primitive is placed by its centre.
        args_3d: XYZ,
        required,
        takes_common_3d: true,
    }
}

/// A non-`draw::` 3d-only builtin.
const fn ns3(
    namespace: &'static str,
    name: &'static str,
    args: &'static [&'static str],
    required: &'static [&'static str],
) -> Builtin {
    Builtin {
        namespace,
        name,
        availability: Availability::ThreeDOnly,
        args,
        args_3d: &[],
        required,
        takes_common_3d: false,
    }
}

/// A non-`draw::` builtin available in both canvas modes.
const fn ns(namespace: &'static str, name: &'static str, args: &'static [&'static str]) -> Builtin {
    Builtin {
        namespace,
        name,
        availability: Availability::Both,
        args,
        args_3d: &[],
        required: &[],
        takes_common_3d: false,
    }
}

/// `color::` constructors. Their arguments were silently defaulted to 0.0 when
/// misspelled, so `color::rgb(red: 1.0)` quietly rendered black — the whole
/// reason these are in the table.
pub const COLOR_ARGS: &[(&str, &[&str])] = &[
    ("mix", &["a", "b", "amount"]),
    ("radial_gradient", &["x", "y", "radius", "color_stops"]),
    ("rgb", &["r", "g", "b", "a"]),
    ("hsl", &["h", "s", "l", "a"]),
    ("linear_gradient", &["x0", "y0", "x1", "y1", "color_stops"]),
];

/// `math::` functions, which had the same silent-default behaviour.
pub const MATH_ARGS: &[(&str, &[&str])] = &[
    ("lerp", &["a", "b", "amount"]),
    (
        "map",
        &[
            "value",
            "input_min",
            "input_max",
            "output_min",
            "output_max",
            "clamp",
        ],
    ),
    ("smoothstep", &["value", "min", "max"]),
    ("wrap", &["value", "min", "max"]),
    ("random", &["seed", "index"]),
    ("noise", &["x", "y", "z", "seed"]),
    ("sin", &["rad"]),
    ("cos", &["rad"]),
    ("tan", &["rad"]),
    ("asin", &["value"]),
    ("acos", &["value"]),
    ("atan", &["value"]),
    ("atan2", &["x", "y"]),
    ("sqrt", &["value"]),
    ("cbrt", &["value"]),
    ("abs", &["value"]),
    ("floor", &["value"]),
    ("ceil", &["value"]),
    ("round", &["value"]),
    ("trunc", &["value"]),
    ("pow", &["base", "exp"]),
    ("exp", &["value"]),
    ("ln", &["value"]),
    ("log2", &["value"]),
    ("log10", &["value"]),
    ("min", &["a", "b"]),
    ("max", &["a", "b"]),
    ("clamp", &["value", "min", "max"]),
];

/// Channel names that used to be spelled in full.
///
/// Worth naming explicitly rather than leaving to edit distance, which will
/// never connect `red` to `r` at any threshold that is not also wild guessing
/// elsewhere. These are the spellings a hand types out of habit.
pub const RENAMED_COLOR_ARGS: &[(&str, &str)] = &[
    ("red", "r"),
    ("green", "g"),
    ("blue", "b"),
    ("hue", "h"),
    ("saturation", "s"),
    ("lightness", "l"),
];

/// The namespaces the resolver knows about, for "unknown namespace" reporting.
pub const KNOWN_NAMESPACES: &[&str] = &[
    "draw",
    "camera",
    "transform",
    "light",
    "gfx",
    "effect::filter",
    "effect",
];

pub fn lookup(namespace: &str, name: &str) -> Option<&'static Builtin> {
    BUILTINS
        .iter()
        .find(|b| b.namespace == namespace && b.name == name)
}

impl Builtin {
    /// Every argument name legal for this call in the given mode.
    pub fn accepted_args(&self, context: ContextKind) -> Vec<&'static str> {
        let mut names: Vec<&'static str> = self.args.to_vec();
        if context == ContextKind::ThreeD {
            names.extend_from_slice(self.args_3d);
            if self.takes_common_3d {
                names.extend_from_slice(COMMON_3D_DRAW_ARGS);
            }
        }
        if self.namespace == "draw" && matches!(self.name, "line" | "polyline" | "bezier" | "arc") {
            names.retain(|n| !matches!(*n, "texture" | "shading" | "wireframe"));
        }
        if self.namespace == "draw" && matches!(self.name, "polyline" | "bezier") {
            names.retain(|n| *n != "z");
        }
        names.sort_unstable();
        names.dedup();
        names
    }

    pub fn qualified(&self) -> String {
        format!("{}::{}", self.namespace, self.name)
    }
}

/// Levenshtein distance, for the "did you mean" in E3020.
fn distance(a: &str, b: &str) -> usize {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut row = vec![0usize; b.len() + 1];

    for (i, ca) in a.iter().enumerate() {
        row[0] = i + 1;
        for (j, cb) in b.iter().enumerate() {
            let cost = usize::from(ca != cb);
            row[j + 1] = (prev[j] + cost).min(prev[j + 1] + 1).min(row[j] + 1);
        }
        std::mem::swap(&mut prev, &mut row);
    }

    prev[b.len()]
}

/// The closest accepted name to `given`, when one is close enough to be worth
/// suggesting. A wild guess is worse than no guess.
pub fn nearest<'a>(given: &str, candidates: &[&'a str]) -> Option<&'a str> {
    let limit = match given.len() {
        0..=3 => 1,
        4..=7 => 2,
        _ => 3,
    };

    candidates
        .iter()
        .map(|c| (distance(given, c), *c))
        .filter(|(d, _)| *d <= limit)
        .min_by_key(|(d, c)| (*d, c.len()))
        .map(|(_, c)| c)
}

/// Expression-only constructor; deliberately absent from statement builtins.
pub const ARRAY_FILLED: Builtin = Builtin {
    namespace: "array",
    name: "filled",
    availability: Availability::Both,
    args: &["count", "value"],
    args_3d: &[],
    required: &["count", "value"],
    takes_common_3d: false,
};

/// Snapshot-reading expressions; all band arguments are required.
pub const AUDIO_FUNCTIONS: &[&str] = &[
    "get_frequency",
    "get_waveform",
    "get_spectrum",
    "get_beat",
    "get_level",
    "get_bass",
    "get_mid",
    "get_treble",
    "get_band_level",
    "get_onset",
    "get_onset_strength",
];

const fn path(
    name: &'static str,
    args: &'static [&'static str],
    required: &'static [&'static str],
) -> Builtin {
    Builtin {
        namespace: "draw",
        name,
        availability: Availability::Both,
        args,
        args_3d: &["z"],
        required,
        takes_common_3d: true,
    }
}
const fn transform(name: &'static str, args: &'static [&'static str]) -> Builtin {
    Builtin {
        namespace: "transform",
        name,
        availability: Availability::Both,
        args,
        args_3d: &["z"],
        required: &[],
        takes_common_3d: false,
    }
}
