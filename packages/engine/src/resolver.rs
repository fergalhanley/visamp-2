//! Compile-time checking of builtin calls, run straight after parsing.
//!
//! This works over pest `Pair`s for argument-level source positions. The AST
//! preserves statement start locations for runtime errors, but not expression
//! or argument spans. The editor draws squiggles from these compile diagnostics,
//! and the save flow refuses a script that does not compile.
//!
//! Everything reported here fires before the first frame. Errors that can only
//! be known while drawing (an unbalanced transform stack, a mesh that is too
//! large) belong to the runtime instead.

use pest::iterators::{Pair, Pairs};

use crate::builtins::{
    self, Availability, ANGLE_PAIRS, COMMON_3D_DRAW_ARGS, KNOWN_NAMESPACES, PROMOTED_3D_ARGS,
};
use crate::model::ContextKind;
use crate::parser::Rule;

/// Whether the walk is currently inside `gfx::overlay(enabled: true)`.
///
/// Overlay is a straight-line notion: a call turns it on, a later call turns it
/// off. Inside an `if` or a `for` the state after the branch is not knowable
/// without running the script, so entering one that touches overlay drops the
/// walk into `Unknown` and it stops reporting E3060 rather than guessing. A
/// false "not available here" on a script that is fine would be far worse than
/// missing a case that the runtime will catch anyway.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Overlay {
    Off,
    On,
    Unknown,
}

struct Resolver {
    context: ContextKind,
    overlay: Overlay,
    input_context: Option<crate::input::EventKind>,
    in_function: bool,
    errors: Vec<String>,
}

/// Checks every builtin call in the script against the tables in
/// [`crate::builtins`].
///
/// `context` is resolved first by the caller, because a `context` declaration
/// is legal anywhere at the top level — a call on line 2 has to be judged
/// against a declaration that may not appear until line 40.
pub fn resolve(pairs: Pairs<Rule>, context: ContextKind) -> Result<(), String> {
    let mut resolver = Resolver {
        context,
        overlay: Overlay::Off,
        input_context: None,
        in_function: false,
        errors: Vec::new(),
    };

    for pair in pairs {
        resolver.walk(pair);
    }

    if resolver.errors.is_empty() {
        Ok(())
    } else {
        // One report per compile keeps the log readable; the editor positions
        // its squiggle from the first, which is the one to fix first anyway.
        Err(resolver.errors.join("\n\n"))
    }
}

fn located(pair: &Pair<Rule>, message: String) -> String {
    let (line, col) = pair.as_span().start_pos().line_col();
    format!("Parse error:  --> {line}:{col}\n  |\n  = {message}")
}

impl Resolver {
    fn walk(&mut self, pair: Pair<Rule>) {
        match pair.as_rule() {
            Rule::block | Rule::function_def => {
                let previous = (self.input_context, self.in_function);
                self.in_function = pair.as_rule() == Rule::function_def;
                self.input_context = if self.in_function {
                    None
                } else {
                    crate::input::EventKind::from_block(
                        pair.clone().into_inner().next().unwrap().as_str(),
                    )
                };
                for child in pair.into_inner() {
                    self.walk(child);
                }
                (self.input_context, self.in_function) = previous;
            }
            Rule::input_expr => {
                let mut inner = pair.clone().into_inner();
                let function = inner.next().unwrap();
                let path = function.as_str();
                match crate::input::signature(path) {
                    Err(e) => self.errors.push(located(&function, e)),
                    Ok(labels) => {
                        let args: Vec<_> = inner.flat_map(|p| p.into_inner()).collect();
                        let names: Vec<_> = args
                            .iter()
                            .map(|a| a.clone().into_inner().next().unwrap().as_str())
                            .collect();
                        if names != labels {
                            self.errors.push(located(
                                &pair,
                                format!("{path}: expected arguments {labels:?}"),
                            ));
                        }
                        for arg in args {
                            let value = arg.clone().into_inner().nth(1).unwrap();
                            let mut literal = value.clone();
                            loop {
                                let children: Vec<_> = literal.clone().into_inner().collect();
                                if children.len() != 1 {
                                    break;
                                }
                                literal = children[0].clone();
                            }
                            let text = literal.as_str();
                            if literal.as_rule() == Rule::string && path.ends_with("is_button_down")
                            {
                                if let Err(e) = crate::input::button_mask(&text[1..text.len() - 1])
                                {
                                    self.errors.push(located(&value, e));
                                }
                            }
                            self.walk(arg);
                        }
                    }
                }
                if !self.in_function && !crate::input::event_available(path, self.input_context) {
                    self.errors.push(located(
                        &pair,
                        format!("{path} requires a matching input event handler"),
                    ));
                }
            }
            Rule::system_value => {
                if matches!(pair.as_str(), "$MOUSE_X" | "$MOUSE_Y") {
                    let axis = if pair.as_str() == "$MOUSE_X" {
                        "x"
                    } else {
                        "y"
                    };
                    self.errors.push(located(&pair, format!("{} was removed in Visript 5.0; use input::pointer::state::get_{axis}()", pair.as_str())));
                    return;
                }
                let replacement = match pair.as_str() {
                    "$FREQUENCY_DATA" => Some("audio::detect::get_frequency()"),
                    "$TIME_DOMAIN_DATA" => Some("audio::detect::get_waveform()"),
                    "$BEAT" => Some("audio::detect::get_beat()"),
                    _ => None,
                };
                if let Some(replacement) = replacement {
                    self.errors.push(located(&pair, format!(
                        "{} was removed in Visript 4.0; use {replacement}. See the audio migration guide for value ranges.", pair.as_str()
                    )));
                }
            }

            // `color::` and `math::` are their own grammar rules rather than
            // `function_call`, so they need their own arm — without it their
            // arguments went unchecked and a misspelling silently became 0.0.
            Rule::audio_expr => {
                let mut inner = pair.clone().into_inner();
                let function = inner.next().unwrap();
                let name = function.as_str();
                if !builtins::AUDIO_FUNCTIONS.contains(&name) {
                    self.errors.push(located(
                        &function,
                        format!("unknown audio detection function audio::detect::{name}"),
                    ));
                }
                let accepted: &[&str] = if name == "get_band_level" {
                    &["low_hz", "high_hz"]
                } else {
                    &[]
                };
                let mut seen = std::collections::HashSet::new();
                for arg in inner.flat_map(|p| p.into_inner()) {
                    let label = arg.clone().into_inner().next().unwrap();
                    let value = label.as_str();
                    if !accepted.contains(&value) {
                        self.errors.push(located(
                            &label,
                            format!("audio::detect::{name}: unknown argument '{value}'"),
                        ));
                    }
                    if !seen.insert(value.to_owned()) {
                        self.errors.push(located(
                            &label,
                            format!("audio::detect::{name}: duplicate argument '{value}'"),
                        ));
                    }
                }
                for required in accepted {
                    if !seen.contains(*required) {
                        self.errors.push(located(
                            &pair,
                            format!(
                                "audio::detect::{name}: missing required argument '{required}'"
                            ),
                        ));
                    }
                }
                for child in pair.into_inner() {
                    self.walk(child);
                }
            }
            Rule::array_length_expr => {
                let args: Vec<_> = pair
                    .clone()
                    .into_inner()
                    .flat_map(|p| p.into_inner())
                    .collect();
                if args.len() != 1
                    || args[0].clone().into_inner().next().unwrap().as_str() != "value"
                {
                    self.errors.push(located(
                        &pair,
                        "array::length requires exactly one named value argument".into(),
                    ));
                }
                for child in pair.into_inner() {
                    self.walk(child);
                }
            }
            Rule::color_expr => {
                self.check_fixed_args(&pair, "color", builtins::COLOR_ARGS);
                for inner in pair.into_inner() {
                    self.walk(inner);
                }
            }
            Rule::array_expr => {
                let args = pair
                    .clone()
                    .into_inner()
                    .flat_map(|p| p.into_inner())
                    .map(|p| {
                        (
                            p.clone().into_inner().next().unwrap().as_str().to_string(),
                            p,
                        )
                    })
                    .collect::<Vec<_>>();
                self.check_args(&builtins::ARRAY_FILLED, &args, &pair);
                let mut names = std::collections::HashSet::new();
                for (name, arg) in &args {
                    if !names.insert(name) {
                        self.errors.push(located(
                            arg,
                            format!("array::filled: duplicate argument '{name}'"),
                        ));
                    }
                }
                for inner in pair.into_inner() {
                    self.walk(inner);
                }
            }
            Rule::math_expr => {
                self.check_fixed_args(&pair, "math", builtins::MATH_ARGS);
                for inner in pair.into_inner() {
                    self.walk(inner);
                }
            }
            Rule::function_call => {
                self.check_call(&pair);
                // Then the arguments: a `color::` or `math::` call nested in
                // one of them is checked by its own arm, and skipping the
                // recursion here left every such call unexamined.
                for inner in pair.into_inner() {
                    self.walk(inner);
                }
            }
            // A branch or loop body may or may not run, so anything it does to
            // the overlay flag leaves the state unknown afterwards.
            Rule::if_statement | Rule::for_loop | Rule::while_loop => {
                let before = self.overlay;
                for inner in pair.into_inner() {
                    self.walk(inner);
                }
                if self.overlay != before {
                    self.overlay = Overlay::Unknown;
                }
            }
            _ => {
                for inner in pair.into_inner() {
                    self.walk(inner);
                }
            }
        }
    }

    fn check_call(&mut self, pair: &Pair<Rule>) {
        let mut inner = pair.clone().into_inner();
        let Some(path_pair) = inner.next() else {
            return;
        };
        let mut path: Vec<Pair<Rule>> = path_pair.into_inner().collect();
        let Some(name_pair) = path.pop() else { return };
        let namespace = path.iter().map(Pair::as_str).collect::<Vec<_>>().join("::");
        let name = name_pair.as_str();

        if self.input_context.is_some()
            && matches!(
                namespace.as_str(),
                "draw" | "gfx" | "camera" | "transform" | "light" | "effect" | "effect::filter"
            )
        {
            self.errors.push(located(
                pair,
                "drawing and graphics calls belong in render; input handlers update properties"
                    .into(),
            ));
            return;
        }
        if namespace.starts_with("input::") {
            self.errors.push(located(
                &pair,
                "input calls are expressions; bind or use the returned value".into(),
            ));
            return;
        }
        if namespace == "audio::detect" {
            self.errors.push(located(
                pair,
                "audio::detect calls are expressions; bind or use the returned value".into(),
            ));
            return;
        }

        if !KNOWN_NAMESPACES.contains(&namespace.as_str()) {
            // Left alone: an unknown namespace is the interpreter's to report,
            // and user-defined functions are a separate grammar rule.
            return;
        }

        let Some(builtin) = builtins::lookup(&namespace, name) else {
            let candidates: Vec<&str> = builtins::BUILTINS
                .iter()
                .filter(|b| b.namespace == namespace)
                .map(|b| b.name)
                .collect();
            let suggestion = builtins::nearest(name, &candidates)
                .map(|s| format!(" (did you mean `{namespace}::{s}`?)"))
                .unwrap_or_default();
            self.errors.push(located(
                &name_pair,
                format!("unknown builtin `{namespace}::{name}`{suggestion}"),
            ));
            return;
        };

        // E3070 — 3d-only call under `context 2d`.
        if builtin.availability == Availability::ThreeDOnly && self.context == ContextKind::TwoD {
            self.errors.push(located(
                pair,
                format!(
                    "{} is only available in 3d mode (add `context 3d`)",
                    builtin.qualified()
                ),
            ));
            return;
        }

        if builtin.availability == Availability::TwoDOnly && self.context == ContextKind::ThreeD {
            self.errors.push(located(
                pair,
                format!("{} is only available in 2d mode", builtin.qualified()),
            ));
            return;
        }

        // E3060 — 3d call inside a screen-space overlay bracket.
        if self.overlay == Overlay::On && self.is_forbidden_in_overlay(builtin) {
            self.errors.push(located(
                pair,
                format!(
                    "{} is not available inside gfx::overlay",
                    builtin.qualified()
                ),
            ));
            return;
        }

        let args: Vec<(String, Pair<Rule>)> = inner
            .flat_map(|p| p.into_inner())
            .filter(|p| p.as_rule() == Rule::argument)
            .filter_map(|p| {
                let name = p.clone().into_inner().next()?.as_str().to_string();
                Some((name, p))
            })
            .collect();

        if self.context == ContextKind::ThreeD
            && self.overlay == Overlay::Off
            && builtin.namespace == "draw"
        {
            if matches!(builtin.name, "text" | "image") {
                self.errors.push(located(
                    pair,
                    format!(
                        "{} requires gfx::overlay(enabled: true) in 3d",
                        builtin.qualified()
                    ),
                ));
            }
            if args.iter().any(|(n, _)| n == "gradient") {
                self.errors.push(located(
                    pair,
                    "gradients are supported in 2d/overlay only".into(),
                ));
            }
        }
        self.check_args(builtin, &args, pair);
        self.track_overlay(builtin, &args);
    }

    /// Checks a call whose accepted arguments do not vary by mode.
    fn check_fixed_args(&mut self, pair: &Pair<Rule>, namespace: &str, table: &[(&str, &[&str])]) {
        let mut inner = pair.clone().into_inner();
        let Some(kind_pair) = inner.next() else {
            return;
        };
        let kind = kind_pair.as_str();

        let Some((_, accepted)) = table.iter().find(|(name, _)| *name == kind) else {
            // An unrecognised name cannot reach here: the grammar lists the
            // legal ones, so anything else is already a syntax error.
            return;
        };

        let required: &[&str] = if namespace == "math" {
            crate::creative_math::required(kind)
        } else {
            match kind {
                "mix" => &["a", "b", "amount"],
                "radial_gradient" => &["x", "y", "radius", "color_stops"],
                _ => &[],
            }
        };
        let mut seen = std::collections::HashSet::new();
        let mut alpha_seen = false;
        for arg in inner.flat_map(|p| p.into_inner()) {
            if !matches!(arg.as_rule(), Rule::color_arg | Rule::math_arg) {
                continue;
            }
            let Some(name_pair) = arg.clone().into_inner().next() else {
                continue;
            };
            let name = name_pair.as_str();
            if !seen.insert(name.to_owned()) && !required.is_empty() {
                self.errors.push(located(
                    &name_pair,
                    format!("{namespace}::{kind}: duplicate argument '{name}'"),
                ));
            }
            if namespace == "color" && matches!(kind, "rgb" | "hsl") && name == "a" {
                if alpha_seen {
                    self.errors.push(located(
                        &name_pair,
                        format!("color::{kind}: specify a once"),
                    ));
                }
                alpha_seen = true;
            }
            if accepted.contains(&name) {
                continue;
            }

            let renamed = builtins::RENAMED_COLOR_ARGS
                .iter()
                .find(|(old, short)| *old == name && accepted.contains(short))
                .map(|(_, short)| format!(" (it is '{short}' now)"));

            let suggestion = renamed.unwrap_or_else(|| {
                builtins::nearest(name, accepted)
                    .map(|s| format!(" (did you mean '{s}'?)"))
                    .unwrap_or_default()
            });

            self.errors.push(located(
                &name_pair,
                format!("{namespace}::{kind}: unknown argument '{name}'{suggestion}"),
            ));
        }
        for name in required {
            if !seen.contains(*name) {
                self.errors.push(located(
                    pair,
                    format!("{namespace}::{kind}: missing {name}"),
                ));
            }
        }
    }

    /// Everything except the 2D `draw::` set, which stays legal in overlay.
    fn is_forbidden_in_overlay(&self, builtin: &builtins::Builtin) -> bool {
        match builtin.namespace {
            // §7: gfx state calls are ignored rather than rejected in overlay,
            // and gfx::overlay itself is idempotent.
            "gfx" => false,
            "draw" | "transform" => builtin.availability == Availability::ThreeDOnly,
            _ => true,
        }
    }

    fn check_args(
        &mut self,
        builtin: &builtins::Builtin,
        args: &[(String, Pair<Rule>)],
        call: &Pair<Rule>,
    ) {
        let effective_context = if self.overlay == Overlay::On {
            ContextKind::TwoD
        } else {
            self.context
        };
        let accepted = builtin.accepted_args(effective_context);
        let mut seen = std::collections::HashSet::new();
        for (name, arg) in args {
            if !seen.insert(name) {
                self.errors.push(located(
                    arg,
                    format!("{}: duplicate argument '{name}'", builtin.qualified()),
                ));
            }
            if builtin.name == "sprite"
                && (name.starts_with("rotation_x_") || name.starts_with("rotation_y_"))
            {
                self.errors.push(located(
                    arg,
                    "billboard sprites support rotation_z only; tilt is unavailable".into(),
                ));
            }
            let allowed: &[&str] = match (builtin.namespace, builtin.name, name.as_str()) {
                ("gfx", "blend", "mode") => &["alpha", "additive", "multiply", "none"],
                ("gfx", "cull", "mode") => &["back", "front", "none"],
                ("draw", _, "shading") => &["unlit", "flat", "lambert"],
                ("draw", _, "line_cap") => &["butt", "round", "square"],
                ("draw", _, "line_join") => &["round", "bevel"],
                _ => &[],
            };
            let raw = arg
                .as_str()
                .split_once(':')
                .map(|(_, v)| v.trim())
                .unwrap_or("");
            if !allowed.is_empty()
                && raw.starts_with('"')
                && raw.ends_with('"')
                && !allowed.contains(&raw.trim_matches('"'))
            {
                self.errors.push(located(
                    arg,
                    format!(
                        "{}: {name} must be {}",
                        builtin.qualified(),
                        allowed.join(", ")
                    ),
                ));
            }
        }
        if builtin.namespace == "draw"
            && builtin.name == "arc"
            && !args
                .iter()
                .any(|(n, _)| n == "sweep_deg" || n == "sweep_rad")
        {
            self.errors.push(located(
                call,
                "draw::arc: sweep_deg or sweep_rad is required".into(),
            ));
        }

        for (name, arg_pair) in args {
            if accepted.contains(&name.as_str()) {
                continue;
            }

            // E3071 — a 3d-only argument used under `context 2d`. Worth its own
            // message: the author knows what they meant, they just have the
            // wrong mode.
            let three_d_only = PROMOTED_3D_ARGS.contains(&name.as_str())
                || COMMON_3D_DRAW_ARGS.contains(&name.as_str())
                || builtin.args_3d.contains(&name.as_str());

            if three_d_only && self.context == ContextKind::TwoD {
                self.errors.push(located(
                    arg_pair,
                    format!(
                        "{}: argument '{name}' requires `context 3d`",
                        builtin.qualified()
                    ),
                ));
                continue;
            }

            // E3020 — unknown argument.
            let suggestion = builtins::nearest(name, &accepted)
                .map(|s| format!(" (did you mean '{s}'?)"))
                .unwrap_or_default();
            self.errors.push(located(
                arg_pair,
                format!(
                    "{}: unknown argument '{name}'{suggestion}",
                    builtin.qualified()
                ),
            ));
        }

        if builtin.namespace == "draw"
            && builtin.name == "point_cloud"
            && !args
                .iter()
                .any(|(name, _)| name == "count" || name == "model")
        {
            self.errors.push(located(
                call,
                "draw::point_cloud: count or model is required".into(),
            ));
        }

        // E3021 — required argument missing.
        for required in builtin.required {
            if !args.iter().any(|(name, _)| name == required) {
                // `draw::mesh()` has no argument to point at, so a missing
                // one is reported against the call itself.
                self.errors.push(located(
                    call,
                    format!(
                        "{}: missing required argument '{required}'",
                        builtin.qualified()
                    ),
                ));
            }
        }

        // E3010 — the same angle given in both units.
        for (deg, rad) in ANGLE_PAIRS {
            let has_deg = args.iter().find(|(name, _)| name == deg);
            let has_rad = args.iter().find(|(name, _)| name == rad);
            if let (Some((_, pair)), Some(_)) = (has_deg, has_rad) {
                if accepted.contains(deg) && accepted.contains(rad) {
                    self.errors.push(located(
                        pair,
                        format!("{}: specify {deg} or {rad}, not both", builtin.qualified()),
                    ));
                }
            }
        }
    }

    fn track_overlay(&mut self, builtin: &builtins::Builtin, args: &[(String, Pair<Rule>)]) {
        if builtin.namespace != "gfx" || builtin.name != "overlay" {
            return;
        }

        // Only a literal `true` / `false` can be read statically. Anything
        // computed leaves the state unknown.
        let enabled = args
            .iter()
            .find(|(name, _)| name == "enabled")
            .and_then(|(_, pair)| pair.clone().into_inner().nth(1))
            .map(|expr| expr.as_str().trim().to_string());

        self.overlay = match enabled.as_deref() {
            Some("true") => Overlay::On,
            Some("false") => Overlay::Off,
            // `gfx::overlay()` with no argument defaults to false (§6.7).
            None => Overlay::Off,
            // Anything computed cannot be read without running the script.
            Some(_) => Overlay::Unknown,
        };
    }
}
