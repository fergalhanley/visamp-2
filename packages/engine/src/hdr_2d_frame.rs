//! Versioned, ordered 2D presentation commands. Geometry is resolved by the same
//! path builder as Canvas2D; effects are recorded after the render blocks finish.
use crate::{
    drawing::{self, Call, CanvasState},
    filters::Filter,
    model::{Color, Value as ScriptValue, BLACK, WHITE},
    scramble::Scramble,
};
use serde_json::{json, Value};

const MAX_COMMANDS: usize = 2048;

/// Explicit draw intensity opts into HDR, including dynamic values in functions
/// and conditional branches. Comments, strings and effect intensity do not.
pub fn requested(script: &crate::model::Script) -> bool {
    use crate::model::{ContextKind, Statement, StatementKind};
    fn has(statements: &[Statement]) -> bool {
        statements.iter().any(|s| match &s.kind {
            StatementKind::FunctionCall(c) => {
                c.namespace == "draw" && c.args.iter().any(|a| a.name == "intensity")
            }
            StatementKind::If(s) => {
                has(&s.then_body) || s.else_body.as_ref().is_some_and(|b| has(b))
            }
            StatementKind::For(s) => has(&s.body),
            StatementKind::While(s) => has(&s.body),
            _ => false,
        })
    }
    script.context == ContextKind::TwoD
        && (script.blocks.iter().any(|b| has(&b.statements))
            || script.functions.iter().any(|f| has(&f.body)))
}
#[derive(Default)]
pub struct Frame {
    commands: Vec<Value>,
    sequence: u64,
    blend: String,
    effects: Vec<Value>,
    scramble: Option<Value>,
    seconds: f64,
    clear_scene: bool,
    pub error: Option<String>,
}
fn rgba(c: Color) -> [f64; 4] {
    [c.r, c.g, c.b, c.a].map(|v| v.clamp(0.0, 1.0))
}
impl Frame {
    pub fn reset(&mut self) {
        self.commands.clear();
        self.effects.clear();
        self.scramble = None;
        self.error = None;
        self.sequence += 1;
        self.begin_block();
    }
    pub fn begin_block(&mut self) {
        self.blend = "alpha".into();
    }
    pub fn finish(
        &mut self,
        filters: &[Filter],
        scramble: Option<Scramble>,
        seconds: f64,
        clear_scene: bool,
    ) {
        self.effects = filters.iter().map(|f| json!({"kind":f.kind as i32,"amount":f.amount,"params":f.params,"color":f.color,"asset":f.asset})).collect();
        self.scramble = scramble.map(|s| json!({"kind":s.kind,"refresh":rgba(s.refresh)}));
        self.seconds = seconds.max(0.0);
        self.clear_scene = clear_scene;
    }
    /// Called only after successful Canvas2D validation/dispatch.
    pub fn record(&mut self, c: &Call, state: &CanvasState) -> Result<(), String> {
        if c.namespace == "transform" {
            return Ok(());
        }
        if c.namespace == "gfx" && c.name == "blend" {
            self.blend = c.text("mode", "alpha")?;
            return Ok(());
        }
        if c.namespace != "draw" {
            return Err(format!("Unknown HDR command {}::{}", c.namespace, c.name));
        }
        if self.commands.len() >= MAX_COMMANDS {
            return Err("HDR 2D command budget exceeded (2048)".into());
        }
        if c.name == "clear" {
            self.commands.push(json!({"kind":"clear"}));
            return Ok(());
        }
        let intensity = c.number("intensity", 1.0)?;
        if !(0.0..=6.0).contains(&intensity) {
            return Err("draw intensity must be between 0 and 6".into());
        }
        let matrix = state.matrix();
        let m = matrix.as_slice();
        let transform = [m[0], m[1], m[4], m[5], m[12], m[13]];
        let stroke = matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc")
            || c.boolean("stroke", false)?;
        let outline = stroke && !matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc");
        let color = c.color(
            if outline { "stroke_color" } else { "color" },
            if outline || c.name == "background" {
                BLACK
            } else {
                WHITE
            },
        )?;
        let gradient = c.args.get("gradient").cloned().map(ScriptValue::try_into_gradient).transpose()?.map(|g| json!({
            "axis":[g.x0,g.y0,g.x1,g.y1], "radius":g.radial_radius,
            "stops":g.stops.iter().map(|s| json!([s.offset,rgba(s.color)])).collect::<Vec<_>>()
        }));
        let mut command = json!({"kind":c.name,"transform":transform,"blend":self.blend,"intensity":intensity,"color":rgba(color),"gradient":gradient});
        match c.name.as_str() {
            "background" => {}
            "text" => {
                command["text"] = json!(c.text("content", "")?);
                command["font"] = json!(format!(
                    "{}px {}",
                    c.number("size", 16.0)?,
                    c.text("font", "monospace")?
                ));
                command["position"] = json!([c.number("x", 0.0)?, c.number("y", 0.0)?]);
            }
            "image" => {
                let Some(ScriptValue::Asset(asset)) = c.args.get("asset") else {
                    return Err("image requires a texture asset".into());
                };
                command["asset"] = json!(asset.id);
                command["rect"] = json!([
                    c.number("x", 0.0)?,
                    c.number("y", 0.0)?,
                    c.number("width", 0.0)?,
                    c.number("height", 0.0)?
                ]);
                command["opacity"] = json!(c.number("opacity", 1.0)?);
            }
            _ => {
                let angle = c.angle("rotation_")?;
                let project_matrix = matrix.mul(&crate::math3::Mat4::rotation_z(angle as f32));
                let project = |p: [f64; 3]| {
                    let q = project_matrix.transform_point(p.map(|v| v as f32));
                    [q[0] as f64, q[1] as f64]
                };
                let resolved;
                let (points, closed, pivot) = match &state.last_path {
                    Some(path) => path,
                    None => {
                        resolved = drawing::path(c, 2, &project)?;
                        &resolved
                    }
                };
                command["kind"] = json!("path");
                command["points"] = json!(points.iter().map(|p| [p[0], p[1]]).collect::<Vec<_>>());
                command["closed"] = json!(closed);
                command["pivot"] = json!([pivot[0], pivot[1]]);
                command["rotation"] = json!(angle);
                command["stroke"] = if stroke {
                    json!({"width":c.number("stroke_width",1.0)?,"cap":c.text("line_cap","butt")?,"join":c.text("line_join","bevel")?})
                } else {
                    Value::Null
                };
            }
        }
        self.commands.push(command);
        Ok(())
    }
    pub fn snapshot(&self, width: u32, height: u32) -> Result<String, String> {
        if let Some(error) = &self.error {
            return Err(error.clone());
        }
        if width == 0 || height == 0 {
            return Err("HDR 2D frame requires nonzero canvas dimensions".into());
        }
        serde_json::to_string(&json!({"version":2,"sequence":self.sequence,"width":width,"height":height,"commands":self.commands,"effects":self.effects,"scramble":self.scramble,"seconds":self.seconds,"clearScene":self.clear_scene})).map_err(|e|e.to_string())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    #[test]
    fn hdr_intent_comes_from_drawing_calls_not_source_text_or_effects() {
        use crate::parser::build_ast;
        for source in [
            "render { draw::line() effect::bloom(intensity: 3) }",
            "// draw::line(intensity: 4)\nrender { draw::text(content: \"intensity: 3\") }",
            "context 3d render { draw::cube(intensity: 3) }",
        ] {
            assert!(!requested(&build_ast(source).unwrap()), "{source}");
        }
        for source in [
            "prop gain = 3 render { draw::line(intensity: gain) }",
            "fn dot(gain: 3) { draw::circle(intensity: gain) } render { dot() }",
            "render { if false { draw::rect(intensity: 1) } }",
            "render { let i = 0 while i < 1 { draw::line(intensity: 4) i = i + 1 } }",
        ] {
            assert!(requested(&build_ast(source).unwrap()), "{source}");
        }
    }
    fn call(name: &str) -> Call {
        Call {
            location: None,
            namespace: "draw".into(),
            name: name.into(),
            args: BTreeMap::new(),
        }
    }
    fn output(frame: &Frame) -> Value {
        serde_json::from_str(&frame.snapshot(640, 360).unwrap()).unwrap()
    }
    #[test]
    fn rotated_stroke_retains_intensity_and_shared_geometry() {
        let mut c = call("rect");
        c.args
            .insert("rotation_rad".into(), ScriptValue::Float(1.2));
        c.args.insert("intensity".into(), ScriptValue::Float(4.1));
        c.args.insert("stroke".into(), ScriptValue::Boolean(true));
        let mut f = Frame::default();
        f.reset();
        f.record(&c, &CanvasState::default()).unwrap();
        let o = output(&f);
        let p = &o["commands"][0];
        assert_eq!(p["intensity"], 4.1);
        assert_eq!(p["rotation"], 1.2);
        assert_eq!(p["pivot"], json!([50.0, 50.0]));
        assert_eq!(p["stroke"]["width"], 1.0);
        assert_eq!(o["sequence"], 1);
    }
    #[test]
    fn backgrounds_and_clears_remain_ordered() {
        let mut f = Frame::default();
        f.reset();
        for name in ["line", "clear", "background", "ellipse", "text"] {
            f.record(&call(name), &CanvasState::default()).unwrap();
        }
        let o = output(&f);
        assert_eq!(o["commands"].as_array().unwrap().len(), 5);
        assert_eq!(o["commands"][2]["color"], json!([0.0, 0.0, 0.0, 1.0]));
    }
    #[test]
    fn block_boundaries_reset_blending_but_not_draws() {
        let mut f = Frame::default();
        f.reset();
        let mut blend = call("blend");
        blend.namespace = "gfx".into();
        blend
            .args
            .insert("mode".into(), ScriptValue::String("additive".into()));
        f.record(&blend, &CanvasState::default()).unwrap();
        f.record(&call("circle"), &CanvasState::default()).unwrap();
        f.begin_block();
        f.record(&call("circle"), &CanvasState::default()).unwrap();
        let o = output(&f);
        assert_eq!(o["commands"][0]["blend"], "additive");
        assert_eq!(o["commands"][1]["blend"], "alpha");
    }

    #[test]
    fn frame_effects_keep_order_parameters_and_feedback_timing() {
        use crate::filters::Kind;
        let mut f = Frame::default();
        f.reset();
        f.finish(
            &[
                Filter {
                    kind: Kind::Brightness,
                    amount: 3.0,
                    params: [0.0; 8],
                    color: [0.0; 4],
                    asset: None,
                },
                Filter {
                    kind: Kind::Displace,
                    amount: 1.0,
                    params: [7.0; 8],
                    color: [0.0; 4],
                    asset: Some("map".into()),
                },
            ],
            Some(Scramble {
                kind: 40,
                refresh: Color::new(0.2, 0.3, 0.4, 0.1),
            }),
            0.02,
            true,
        );
        let o = output(&f);
        assert_eq!(o["effects"][0]["kind"], 1);
        assert_eq!(o["effects"][0]["amount"], 3.0);
        assert_eq!(o["effects"][1]["kind"], 26);
        assert_eq!(o["effects"][1]["asset"], "map");
        assert_eq!(o["effects"][1]["params"], json!(vec![7.0; 8]));
        assert_eq!(o["scramble"]["kind"], 40);
        assert_eq!(o["seconds"], 0.02);
        assert_eq!(o["clearScene"], true);
        f.reset();
        assert_eq!(output(&f)["effects"], json!([]));
        assert_eq!(output(&f)["scramble"], Value::Null);
    }
}
