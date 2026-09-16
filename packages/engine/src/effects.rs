//! Runtime contracts for whole-frame effects. Arguments have already been evaluated once.
use crate::{
    filters::{Filter, Kind},
    model::{AssetKind, Value},
};
use std::collections::HashMap;

struct Args {
    name: String,
    values: HashMap<String, Value>,
}
impl Args {
    fn error(&self, key: &str, expected: &str) -> String {
        format!("effect::{}: '{key}' must be {expected}", self.name)
    }
    fn number(&mut self, key: &str, default: f32) -> Result<f32, String> {
        let value = match self.values.remove(key) {
            None => default,
            Some(Value::Integer(n)) => n as f32,
            Some(Value::Float(n)) => n as f32,
            _ => return Err(self.error(key, "a finite number")),
        };
        if value.is_finite() && value.abs() <= 1_000_000.0 {
            Ok(value)
        } else {
            Err(self.error(key, "a finite number with magnitude at most 1000000"))
        }
    }
    fn range(&mut self, key: &str, default: f32, min: f32, max: f32) -> Result<f32, String> {
        let n = self.number(key, default)?;
        if n < min || n > max {
            Err(self.error(key, &format!("between {min} and {max}")))
        } else {
            Ok(n)
        }
    }
    fn positive(&mut self, key: &str, default: f32) -> Result<f32, String> {
        let n = self.number(key, default)?;
        if n < 0.001 {
            Err(self.error(key, "at least 0.001 pixels"))
        } else {
            Ok(n)
        }
    }
    fn count(&mut self, key: &str, default: i64, min: i64, max: i64) -> Result<f32, String> {
        // Counts follow the language's integer contract (math::floor still returns a float).
        let n = match self.values.remove(key) {
            None => default,
            Some(Value::Integer(n)) => n,
            _ => return Err(self.error(key, "an integer")),
        };
        if n < min || n > max {
            Err(self.error(key, &format!("an integer between {min} and {max}")))
        } else {
            Ok(n as f32)
        }
    }
    fn angle(&mut self) -> Result<f32, String> {
        let angle = if self.values.contains_key("deg") {
            self.number("deg", 0.0)?.to_radians()
        } else {
            self.number("rad", 0.0)?
        };
        if !angle.is_finite() {
            return Err(self.error("angle", "finite"));
        }
        Ok(angle.rem_euclid(std::f32::consts::TAU))
    }
}

pub fn operation(
    name: &str,
    values: HashMap<String, Value>,
    width: f32,
    height: f32,
) -> Result<Filter, String> {
    use Kind::*;
    let kind = match name {
        "kaleidoscope" => Kaleidoscope,
        "swirl" => Swirl,
        "pixelate" | "pixelate_rect" => PixelateRect,
        "pixelate_circle" => PixelateCircle,
        "pixelate_triangle" => PixelateTriangle,
        "pixelate_pentagon" => PixelatePentagon,
        "pixelate_hexagon" => PixelateHexagon,
        "pixelate_pentagram" => PixelatePentagram,
        "pixelate_hexagram" => PixelateHexagram,
        "mirror" => Mirror,
        "posterize" => Posterize,
        "chromatic_aberration" => ChromaticAberration,
        "vignette" => Vignette,
        "ripple" => Ripple,
        "scanlines" => Scanlines,
        "bloom" => Bloom,
        "displace" => Displace,
        _ => return Err(format!("Unknown effect::{name}")),
    };
    let mut a = Args {
        name: name.into(),
        values,
    };
    let mut f = Filter::new(kind, 0.0);
    let p = &mut f.params;
    match kind {
        Kaleidoscope | Swirl | Vignette | Ripple => {
            p[0] = a.number("x", width / 2.0)?;
            p[1] = a.number("y", height / 2.0)?;
            match kind {
                Kaleidoscope => {
                    p[2] = a.count("segments", 8, 2, 64)?;
                    p[3] = a.count("branches", 1, 1, 6)?;
                    p[4] = a.angle()?;
                }
                Swirl => {
                    p[2] = a.positive("radius", width.min(height) / 2.0)?;
                    // Swirl strength is not periodic: preserve turns and sign.
                    p[3] = if a.values.contains_key("deg") {
                        a.number("deg", 0.0)?.to_radians()
                    } else {
                        a.number("rad", 0.0)?
                    };
                }
                Vignette => {
                    p[2] = a.positive("radius", width.min(height) / 2.0)?;
                    p[3] = a.range("softness", 0.5, 0.001, 1.0)?;
                    f.amount = a.range("amount", 0.5, 0.0, 1.0)?;
                }
                _ => {
                    p[2] = a.positive("wavelength", 40.0)?;
                    p[3] = a.number("amplitude", 8.0)?;
                    p[4] = a.number("phase", 0.0)?.rem_euclid(1.0);
                }
            }
        }
        PixelateRect | PixelateCircle | PixelateTriangle | PixelatePentagon | PixelateHexagon
        | PixelatePentagram | PixelateHexagram => {
            let dimension = match name {
                "pixelate_rect" => "width",
                "pixelate_triangle" | "pixelate_pentagon" | "pixelate_hexagon" => "side_length",
                _ => "size",
            };
            p[0] = a.positive(dimension, 10.0)?;
            p[1] = if name == "pixelate_rect" {
                a.positive("height", 10.0)?
            } else {
                p[0]
            };
            p[2] = a.range("gap", 0.0, 0.0, f32::MAX)?;
            p[3] = a.angle()?;
            if let Some(v) = a.values.remove("gap_color") {
                let c = v
                    .try_into_color()
                    .map_err(|_| a.error("gap_color", "a colour"))?;
                let channels = [c.r as f32, c.g as f32, c.b as f32, c.a as f32];
                if channels.iter().any(|n| !n.is_finite()) {
                    return Err(a.error("gap_color", "a finite colour"));
                }
                f.color = channels.map(|n| n.clamp(0.0, 1.0));
            }
        }
        Mirror => {
            p[0] = match a.values.remove("axis") {
                None => 0.0,
                Some(Value::String(s)) => match s.as_str() {
                    "x" => 0.0,
                    "y" => 1.0,
                    "both" => 2.0,
                    _ => return Err(a.error("axis", "x, y or both")),
                },
                _ => return Err(a.error("axis", "x, y or both")),
            };
        }
        Posterize => f.amount = a.count("levels", 6, 2, 256)?,
        ChromaticAberration => {
            p[0] = a.number("amount", 5.0)?;
            p[1] = a.angle()?;
        }
        Scanlines => {
            p[0] = a.positive("spacing", 4.0)?;
            p[1] = a.angle()?;
            f.amount = a.range("amount", 0.3, 0.0, 1.0)?;
        }
        Bloom => {
            f.amount = a.range("threshold", 0.8, 0.0, 1.0)?;
            p[0] = a.range("intensity", 1.2, 0.0, 64.0)?;
            p[1] = a.range("radius", 12.0, 0.0, 4096.0)?;
        }
        Displace => {
            p[0] = a.number("amount", 20.0)?;
            let handle = match a.values.remove("map") {
                Some(Value::Asset(h)) if h.kind == AssetKind::Bitmap => h,
                _ => return Err(a.error("map", "an asset::bitmap reference")),
            };
            if !crate::assets::with_store(|s| s.texture(&handle.id).is_some()) {
                return Err(format!(
                    "effect::displace: bitmap '{}' is not loaded",
                    handle.id
                ));
            }
            f.asset = Some(handle.id);
        }
        _ => unreachable!(),
    }
    if f.params.iter().any(|v| !v.is_finite()) {
        return Err(format!(
            "effect::{name}: parameters exceed finite GPU precision"
        ));
    }
    Ok(f)
}

/// Catch simple literal mistakes during compilation; computed values use the same runtime contract.
pub fn literal_error(name: &str, key: &str, raw: &str) -> Option<String> {
    let n = raw.parse::<f64>().ok()?;
    let integer = matches!(
        (name, key),
        ("kaleidoscope", "segments" | "branches") | ("posterize", "levels")
    );
    if integer && raw.parse::<i64>().is_err() {
        return Some(format!("effect::{name}: '{key}' must be an integer"));
    }
    let (min, max) = match (name, key) {
        ("kaleidoscope", "segments") => (2.0, 64.0),
        ("kaleidoscope", "branches") => (1.0, 6.0),
        ("posterize", "levels") => (2.0, 256.0),
        ("vignette", "amount") | ("scanlines", "amount") | ("bloom", "threshold") => (0.0, 1.0),
        ("vignette", "softness") => (0.001, 1.0),
        ("bloom", "intensity") => (0.0, 64.0),
        ("bloom", "radius") => (0.0, 4096.0),
        (_, "gap") => (0.0, 1e6),
        (_, "size" | "width" | "height" | "side_length" | "radius" | "wavelength" | "spacing") => {
            (0.001, 1e6)
        }
        _ => (-1e6, 1e6),
    };
    if !n.is_finite() || n < min || n > max {
        Some(format!(
            "effect::{name}: '{key}' must be between {min} and {max}"
        ))
    } else {
        None
    }
}
