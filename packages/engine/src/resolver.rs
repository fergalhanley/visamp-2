//! Compile-time checking of builtin calls, run straight after parsing.
//!
//! This works over pest `Pair`s rather than the AST because the AST carries no
//! source positions, and every diagnostic here has to point at a line and
//! column — the editor draws squiggles from them, and the save flow refuses a
//! script that does not compile.
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
            // `color::` and `math::` are their own grammar rules rather than
            // `function_call`, so they need their own arm — without it their
            // arguments went unchecked and a misspelling silently became 0.0.
            Rule::color_expr => {
                self.check_fixed_args(&pair, "color", builtins::COLOR_ARGS);
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
        let Some(namespace_pair) = inner.next() else { return };
        let Some(name_pair) = inner.next() else { return };

        let namespace = namespace_pair.as_str();
        let name = name_pair.as_str();

        if !KNOWN_NAMESPACES.contains(&namespace) {
            // Left alone: an unknown namespace is the interpreter's to report,
            // and user-defined functions are a separate grammar rule.
            return;
        }

        let Some(builtin) = builtins::lookup(namespace, name) else {
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

        self.check_args(builtin, &args, pair);
        self.track_overlay(builtin, &args);
    }

    /// Checks a call whose accepted arguments do not vary by mode.
    fn check_fixed_args(
        &mut self,
        pair: &Pair<Rule>,
        namespace: &str,
        table: &[(&str, &[&str])],
    ) {
        let mut inner = pair.clone().into_inner();
        let Some(kind_pair) = inner.next() else { return };
        let kind = kind_pair.as_str();

        let Some((_, accepted)) = table.iter().find(|(name, _)| *name == kind) else {
            // An unrecognised name cannot reach here: the grammar lists the
            // legal ones, so anything else is already a syntax error.
            return;
        };

        for arg in inner.flat_map(|p| p.into_inner()) {
            if !matches!(arg.as_rule(), Rule::color_arg | Rule::math_arg) {
                continue;
            }
            let Some(name_pair) = arg.clone().into_inner().next() else { continue };
            let name = name_pair.as_str();
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
    }

    /// Everything except the 2D `draw::` set, which stays legal in overlay.
    fn is_forbidden_in_overlay(&self, builtin: &builtins::Builtin) -> bool {
        match builtin.namespace {
            // §7: gfx state calls are ignored rather than rejected in overlay,
            // and gfx::overlay itself is idempotent.
            "gfx" => false,
            "draw" => builtin.availability == Availability::ThreeDOnly,
            _ => true,
        }
    }

    fn check_args(
        &mut self,
        builtin: &builtins::Builtin,
        args: &[(String, Pair<Rule>)],
        call: &Pair<Rule>,
    ) {
        let accepted = builtin.accepted_args(self.context);

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
                        format!(
                            "{}: specify {deg} or {rad}, not both",
                            builtin.qualified()
                        ),
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
