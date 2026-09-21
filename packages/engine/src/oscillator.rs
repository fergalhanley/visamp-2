//! Stateless samples of the shared animation timeline; phases are cycles, not radians.
use crate::model::Value;
pub const NAMES: &[&str] = &["sin", "cos", "saw", "triangle", "square"];
pub const ARGS: &[&str] = &["min", "max", "period", "phase"];
pub const SQUARE_ARGS: &[&str] = &["min", "max", "period", "phase", "duty"];

#[derive(Debug, Clone, Copy)]
pub struct Parameters {
    min: f64,
    max: f64,
    period: f64,
    phase: f64,
    duty: f64,
}

/// None values are dynamic expressions: validate everything statically known,
/// but never replace a dynamic argument with its default.
pub fn validate(
    name: &str,
    args: &[(String, Option<Value>)],
) -> Result<Option<Parameters>, String> {
    let fail = |message: &str| format!("oscillator::{name}: {message}");
    if !NAMES.contains(&name) {
        return Err(fail("unknown function"));
    }
    let accepted = if name == "square" { SQUARE_ARGS } else { ARGS };
    let mut values = [Some(0.0), Some(1.0), Some(1.0), Some(0.0), Some(0.5)];
    let mut seen = std::collections::HashSet::new();
    for (key, value) in args {
        let Some(index) = accepted.iter().position(|n| *n == key) else {
            return Err(fail(&format!("unknown argument '{key}'")));
        };
        if !seen.insert(key) {
            return Err(fail(&format!("duplicate argument '{key}'")));
        }
        values[index] = match value {
            None => None,
            Some(value) => {
                let n = value
                    .as_f64()
                    .filter(|n| n.is_finite())
                    .ok_or_else(|| fail(&format!("{key} must be a finite number")))?;
                if key == "period" && n <= 0.0 {
                    return Err(fail("period must be a finite number greater than 0"));
                }
                if key == "duty" && !(0.0..=1.0).contains(&n) {
                    return Err(fail("duty must be between 0 and 1 inclusive"));
                }
                Some(n)
            }
        };
    }
    if let (Some(min), Some(max)) = (values[0], values[1]) {
        if min > max {
            return Err(fail("min must be less than or equal to max"));
        }
    }
    Ok(match values {
        [Some(min), Some(max), Some(period), Some(phase), Some(duty)] => Some(Parameters {
            min,
            max,
            period,
            phase,
            duty,
        }),
        _ => None,
    })
}

pub fn evaluate(name: &str, args: &[(String, Value)], time_sec: f64) -> Result<f64, String> {
    let values: Vec<_> = args
        .iter()
        .map(|(n, v)| (n.clone(), Some(v.clone())))
        .collect();
    let p = validate(name, &values)?
        .ok_or_else(|| format!("oscillator::{name}: unresolved arguments"))?;
    if !time_sec.is_finite() {
        return Err(format!("oscillator::{name}: animation time must be finite"));
    }
    // Bounds do not excuse invalid period/phase/duty.
    if p.min == p.max {
        return Ok(p.min);
    }
    // Reduce time and phase separately to retain the fraction for large phase
    // offsets and avoid overflow when finite time / period exceeds f64.
    let cycles = time_sec / p.period;
    let base = if cycles.is_finite() {
        cycles - cycles.floor()
    } else {
        time_sec.rem_euclid(p.period) / p.period
    };
    let offset = p.phase - p.phase.floor();
    let sum = base + offset;
    let phase = sum - sum.floor();
    let w = match name {
        "sin" => (1.0 + (std::f64::consts::TAU * phase).sin()) / 2.0,
        "cos" => (1.0 + (std::f64::consts::TAU * phase).cos()) / 2.0,
        "saw" => phase,
        "triangle" => 1.0 - (2.0 * phase - 1.0).abs(),
        "square" => {
            if phase < p.duty {
                1.0
            } else {
                0.0
            }
        }
        _ => return Err(format!("oscillator::{name}: unknown function")),
    };
    // Opposite-sign extreme bounds can overflow max-min despite a finite result.
    let result = if p.min < 0.0 && p.max > 0.0 {
        (1.0 - w) * p.min + w * p.max
    } else {
        p.min + (p.max - p.min) * w
    };
    if !phase.is_finite() || !w.is_finite() || !result.is_finite() {
        return Err(format!(
            "oscillator::{name}: sample could not be computed as a finite number"
        ));
    }
    let tolerance = p.min.abs().max(p.max.abs()).max(1.0) * f64::EPSILON * 4.0;
    if result < p.min - tolerance || result > p.max + tolerance {
        return Err(format!(
            "oscillator::{name}: sample exceeded min/max bounds"
        ));
    }
    Ok(result.clamp(p.min, p.max))
}
