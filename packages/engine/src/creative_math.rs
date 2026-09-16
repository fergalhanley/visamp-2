//! Pure helpers; matching shader helpers live in creative_math.glsl.
use crate::model::{Color, Value};
pub const NAMES: &[&str] = &["lerp", "map", "wrap", "smoothstep", "noise", "random"];
pub fn required(name: &str) -> &'static [&'static str] {
    match name {
        "lerp" => &["a", "b", "amount"],
        "map" => &[
            "value",
            "input_min",
            "input_max",
            "output_min",
            "output_max",
        ],
        "wrap" | "smoothstep" => &["value", "min", "max"],
        "noise" => &["x"],
        "random" => &["seed", "index"],
        _ => &[],
    }
}
pub fn hash(mut n: u32) -> u32 {
    n ^= n >> 16;
    n = n.wrapping_mul(0x7feb352d);
    n ^= n >> 15;
    n = n.wrapping_mul(0x846ca68b);
    n ^ (n >> 16)
}
pub fn random(seed: u32, index: u32) -> f64 {
    (hash(index ^ hash(seed)) >> 8) as f64 / 16777216.0
}
pub fn noise(x: f64, y: f64, z: f64, seed: u32) -> f64 {
    let p = [x, y, z];
    let cell = p.map(|v| v.floor() as i32);
    let f = p.map(|v| {
        let t = v - v.floor();
        t * t * (3.0 - 2.0 * t)
    });
    let mut sum = 0.0;
    for corner in 0..8 {
        let mut weight = 1.0;
        let mut h = seed;
        for axis in 0..3 {
            let bit = (corner >> axis) & 1;
            weight *= if bit == 0 { 1.0 - f[axis] } else { f[axis] };
            h = hash(h ^ (cell[axis] + bit) as u32);
        }
        sum += weight * (h >> 8) as f64 / 16777216.0;
    }
    sum
}
pub fn evaluate(name: &str, args: &[(String, Value)]) -> Result<f64, String> {
    let number = |key: &str, default: Option<f64>| -> Result<f64, String> {
        let value = match args.iter().find(|(n, _)| n == key) {
            Some((_, v)) => v.clone().try_into_f64()?,
            None => default.ok_or_else(|| format!("math::{name}: missing {key}"))?,
        };
        if !value.is_finite() {
            return Err(format!("math::{name}: {key} must be finite"));
        }
        Ok(value)
    };
    let integer = |key: &str, default: Option<f64>| -> Result<u32, String> {
        let n = number(key, default)?;
        if n.fract() != 0.0 || !(0.0..=16777215.0).contains(&n) {
            return Err(format!(
                "math::{name}: {key} must be a whole number from 0 to 16777215"
            ));
        }
        Ok(n as u32)
    };
    let result = match name {
        "lerp" => {
            let a = number("a", None)?;
            a + (number("b", None)? - a) * number("amount", None)?
        }
        "map" => {
            let low = number("input_min", None)?;
            let high = number("input_max", None)?;
            if low == high {
                return Err("math::map: input range must not be zero".into());
            }
            let mut t = (number("value", None)? - low) / (high - low);
            match args.iter().find(|(n, _)| n == "clamp") {
                None | Some((_, Value::Boolean(false))) => {}
                Some((_, Value::Boolean(true))) => t = t.clamp(0.0, 1.0),
                _ => return Err("math::map: clamp must be boolean".into()),
            }
            let a = number("output_min", None)?;
            a + (number("output_max", None)? - a) * t
        }
        "wrap" | "smoothstep" => {
            let low = number("min", None)?;
            let high = number("max", None)?;
            if high <= low {
                return Err(format!("math::{name}: max must exceed min"));
            }
            let n = number("value", None)?;
            if name == "wrap" {
                (n - low).rem_euclid(high - low) + low
            } else {
                let t = ((n - low) / (high - low)).clamp(0.0, 1.0);
                t * t * (3.0 - 2.0 * t)
            }
        }
        "random" => random(integer("seed", None)?, integer("index", None)?),
        "noise" => {
            let x = number("x", None)?;
            let y = number("y", Some(0.0))?;
            let z = number("z", Some(0.0))?;
            if [x, y, z].iter().any(|v| v.abs() > 1000000.0) {
                return Err("math::noise: coordinates must be within +/-1000000".into());
            }
            noise(x, y, z, integer("seed", Some(0.0))?)
        }
        _ => return Err(format!("unknown math function {name}")),
    };
    if !result.is_finite() {
        return Err(format!("math::{name}: result must be finite"));
    }
    Ok(result)
}
pub fn mix(a: Color, b: Color, amount: f64) -> Result<Color, String> {
    if !amount.is_finite() {
        return Err("color::mix: amount must be finite".into());
    }
    let t = amount.clamp(0.0, 1.0);
    fn linear(x: f64) -> f64 {
        if x <= 0.04045 {
            x / 12.92
        } else {
            ((x + 0.055) / 1.055).powf(2.4)
        }
    }
    fn srgb(x: f64) -> f64 {
        if x <= 0.0031308 {
            x * 12.92
        } else {
            1.055 * x.powf(1.0 / 2.4) - 0.055
        }
    }
    let channel = |x, y| srgb(linear(x) * (1.0 - t) + linear(y) * t);
    Ok(Color::new(
        channel(a.r, b.r),
        channel(a.g, b.g),
        channel(a.b, b.b),
        a.a + (b.a - a.a) * t,
    ))
}
