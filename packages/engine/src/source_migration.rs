//! Syntax-aware migration from Visript 2.x parameter names to 3.0.
//! Comments, strings and user-defined parameters are left unchanged.
use crate::parser::{build_ast, Rule, VisriptParser};
use pest::{iterators::Pair, Parser};

pub fn migrate(source: &str) -> Result<String, String> {
    // Parse the old grammar without applying the new signature resolver.
    let pairs = VisriptParser::parse(Rule::script, source).map_err(|e| e.to_string())?;
    let mut edits = Vec::new();
    for pair in pairs {
        collect(pair, &mut edits)?;
    }
    edits.sort_by(|a, b| b.0.cmp(&a.0));
    let mut result = source.to_owned();
    for (start, end, text) in edits {
        result.replace_range(start..end, &text);
    }
    build_ast(&result)?;
    Ok(result)
}

fn renamed<'a>(call: &str, name: &'a str) -> &'a str {
    match (call, name) {
        ("color::rgb" | "color::hsl", "transparent") => "a",
        ("math::sin" | "math::cos" | "math::tan", "radians") => "rad",
        ("draw::rect" | "draw::cube" | "draw::plane" | "draw::sprite", "w") => "width",
        ("draw::rect" | "draw::cube" | "draw::sprite", "h") => "height",
        ("draw::cube" | "draw::plane", "d") => "depth",
        ("draw::ellipse", "rx") => "radius_x",
        ("draw::ellipse", "ry") => "radius_y",
        ("draw::text", "text") => "content",
        ("draw::torus", "tube") => "tube_radius",
        ("draw::rect" | "draw::ellipse" | "draw::polygon", "rotate") => "rotation_rad",
        (c, n) if c.starts_with("draw::") => match n {
            "stroke_weight" => "stroke_width",
            "rot_x" => "rotation_x_deg",
            "rot_y" => "rotation_y_deg",
            "rot_z" => "rotation_z_deg",
            "rot_x_rad" => "rotation_x_rad",
            "rot_y_rad" => "rotation_y_rad",
            "rot_z_rad" => "rotation_z_rad",
            _ => name,
        },
        _ => name,
    }
}

fn collect(pair: Pair<Rule>, edits: &mut Vec<(usize, usize, String)>) -> Result<(), String> {
    if matches!(
        pair.as_rule(),
        Rule::function_call | Rule::color_expr | Rule::math_expr
    ) {
        let mut inner = pair.clone().into_inner();
        let kind = inner.next().unwrap();
        let call = match pair.as_rule() {
            Rule::color_expr => format!("color::{}", kind.as_str()),
            Rule::math_expr => format!("math::{}", kind.as_str()),
            _ => kind
                .into_inner()
                .map(|p| p.as_str())
                .collect::<Vec<_>>()
                .join("::"),
        };
        let mut names = std::collections::HashSet::new();
        for arg in inner.flat_map(|p| p.into_inner()) {
            let mut fields = arg.into_inner();
            let name = fields.next().unwrap();
            let new = renamed(&call, name.as_str());
            if !names.insert(new.to_owned()) {
                return Err(format!(
                    "{call}: migration would produce duplicate argument {new}"
                ));
            }
            if new != name.as_str() {
                let span = name.as_span();
                edits.push((span.start(), span.end(), new.into()));
                if name.as_str() == "transparent" && new == "a" {
                    let expr = fields.next().unwrap();
                    let span = expr.as_span();
                    edits.push((span.start(), span.start(), "1.0 - (".into()));
                    let suffix = if expr.as_str().lines().last().unwrap_or("").contains("//") {
                        "\n)"
                    } else {
                        ")"
                    };
                    edits.push((span.end(), span.end(), suffix.into()));
                }
            }
        }
    }
    for child in pair.into_inner() {
        collect(child, edits)?;
    }
    Ok(())
}
