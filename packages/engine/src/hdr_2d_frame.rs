//! Experimental read-only frame contract for simple 2D HDR shapes.
//! This does not replace the Canvas2D backend or capture its pixels.
use crate::drawing::Call;
use serde_json::{json, Value};

const MAX_SHAPES: usize = 2048;

#[derive(Default)]
pub struct Frame {
    shapes: Vec<Value>,
    clear: Option<[f64; 4]>,
}

impl Frame {
    pub fn reset(&mut self) {
        self.shapes.clear();
        self.clear = None;
    }

    /// Record only the currently supported subset. Never silently omit a draw.
    /// Call after successful Canvas2D dispatch, not before validation.
    pub fn record(&mut self, call: &Call) -> Result<(), String> {
        if call.namespace != "draw" {
            return Err("HDR 2D preview does not support transforms or blend modes yet".into());
        }
        if call.args.contains_key("gradient") || call.args.contains_key("rotation_deg")
            || call.args.contains_key("rotation_rad") || call.args.contains_key("stroke_width")
            || call.args.contains_key("stroke_color")
        {
            return Err("HDR 2D preview does not support gradients, rotation or strokes".into());
        }
        if call.name == "clear" {
            self.reset();
            return Ok(());
        }
        let base = call.color("color", crate::model::WHITE)?;
        let rgba = [base.r, base.g, base.b, base.a];
        if call.name == "background" {
            self.reset();
            self.clear = Some(rgba);
            return Ok(());
        }
        let intensity = call.number("intensity", 1.0)?;
        if !(0.0..=6.0).contains(&intensity) {
            return Err("HDR 2D intensity must be between 0 and 6".into());
        }
        if self.shapes.len() >= MAX_SHAPES {
            return Err("HDR 2D shape budget exceeded".into());
        }
        let x = call.number("x", 0.0)?;
        let y = call.number("y", 0.0)?;
        let shape = match call.name.as_str() {
            "rect" => {
                if call.number("corner_radius", 0.0)? != 0.0 {
                    return Err("HDR 2D preview does not support rounded rectangles".into());
                }
                let width = call.number("width", 100.0)?;
                let height = call.number("height", 100.0)?;
                if width <= 0.0 || height <= 0.0 {
                    return Err("HDR 2D rectangle dimensions must be positive".into());
                }
                json!({"kind":"rect","x":x,"y":y,"width":width,"height":height,"color":rgba,"intensity":intensity})
            }
            "circle" => {
                let radius = call.number("radius", 50.0)?;
                if radius <= 0.0 {
                    return Err("HDR 2D circle radius must be positive".into());
                }
                json!({"kind":"circle","x":x,"y":y,"radius":radius,"color":rgba,"intensity":intensity})
            }
            _ => return Err(format!("HDR 2D preview does not support draw::{}", call.name)),
        };
        self.shapes.push(shape);
        Ok(())
    }

    pub fn snapshot(&self, width: u32, height: u32) -> Result<String, String> {
        if width == 0 || height == 0 {
            return Err("HDR 2D frame requires nonzero canvas dimensions".into());
        }
        serde_json::to_string(&json!({
            "width": width, "height": height,
            "clear": self.clear.unwrap_or([0.0, 0.0, 0.0, 0.0]),
            "shapes": self.shapes
        })).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Value;
    use std::collections::BTreeMap;

    #[test]
    fn records_a_rectangle_with_direct_intensity() {
        let mut args = BTreeMap::new();
        args.insert("width".into(), Value::Float(90.0));
        args.insert("intensity".into(), Value::Float(3.0));
        let mut frame = Frame::default();
        frame.record(&Call { location: None, namespace: "draw".into(), name: "rect".into(), args }).unwrap();
        let output: ValueJson = serde_json::from_str(&frame.snapshot(640, 360).unwrap()).unwrap();
        assert_eq!(output["shapes"][0]["intensity"], 3.0);
        assert_eq!(output["shapes"][0]["width"], 90.0);
    }

    type ValueJson = serde_json::Value;

    #[test]
    fn refuses_unsupported_geometry_instead_of_dropping_it() {
        let mut frame = Frame::default();
        let call = Call { location: None, namespace: "draw".into(), name: "line".into(), args: BTreeMap::new() };
        assert!(frame.record(&call).is_err());
    }
}
