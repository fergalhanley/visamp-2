//! Version 1 modulation contract, shared with the player's pure evaluator.
//! Samples use the engine timeline; no oscillator owns a second advancing clock.
use crate::model::{Declarations, Value};
use serde::Deserialize;

pub const MAX_LFOS: usize = 4;
pub const MAX_ROUTES: usize = 64;
const SAFE_CYCLE: f64 = 9_007_199_254_740_991.0;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Waveform {
    Sine,
    Triangle,
    Square,
    SawUp,
    SawDown,
    SampleHold,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Polarity {
    Bipolar,
    Unipolar,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Lfo {
    pub id: String,
    pub waveform: Waveform,
    pub bars_per_cycle: f64,
    pub phase: f64,
    pub polarity: Polarity,
    pub enabled: bool,
    pub seed: u32,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Route {
    pub lfo_id: String,
    pub property: String,
    pub min: f64,
    pub max: f64,
    pub enabled: bool,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    pub version: u8,
    pub bpm: f64,
    pub beats_per_bar: f64,
    pub lfos: Vec<Lfo>,
    pub routes: Vec<Route>,
}
#[derive(Debug, Clone)]
pub struct PropertyRule {
    pub property: String,
    pub offset: f64,
    pub low: f64,
    pub high: f64,
}
impl PropertyRule {
    pub fn apply(&self, base: &Value) -> Result<Value, String> {
        let value = numeric(base).ok_or_else(|| {
            format!(
                "Modulation requires a finite numeric property: {}",
                self.property
            )
        })?;
        Ok(Value::Float(
            (value + self.offset).clamp(self.low, self.high),
        ))
    }
}
pub fn numeric(value: &Value) -> Option<f64> {
    match value {
        Value::Integer(n) => Some(*n as f64),
        Value::Float(n) if n.is_finite() => Some(*n),
        _ => None,
    }
}
fn name(s: &str) -> bool {
    let mut bytes = s.bytes();
    (1..=128).contains(&s.len())
        && bytes
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == b'_')
        && bytes.all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
fn positive(n: f64) -> bool {
    n.is_finite() && n > 0.0
}
impl Config {
    pub fn parse(payload: &str) -> Result<Option<Self>, String> {
        if payload.len() > 65_536 {
            return Err("Modulation configuration exceeds 64 KiB".into());
        }
        let config: Option<Self> = serde_json::from_str(payload)
            .map_err(|e| format!("Invalid modulation configuration: {e}"))?;
        if let Some(c) = &config {
            c.validate()?;
        }
        Ok(config)
    }
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("Unsupported modulation version".into());
        }
        if !positive(self.bpm) || !positive(self.beats_per_bar) {
            return Err("BPM and beats per bar must be positive finite values".into());
        }
        if self.lfos.len() > MAX_LFOS || self.routes.len() > MAX_ROUTES {
            return Err("Modulation supports at most 4 LFOs and 64 routes".into());
        }
        for (i, lfo) in self.lfos.iter().enumerate() {
            if !name(&lfo.id) || self.lfos[..i].iter().any(|previous| previous.id == lfo.id) {
                return Err("LFO IDs must be valid and unique".into());
            }
            if !lfo.bars_per_cycle.is_finite() || !(1.0 / 16.0..=16.0).contains(&lfo.bars_per_cycle)
            {
                return Err("LFO cycle length must be between 1/16 and 16 bars".into());
            }
            if !lfo.phase.is_finite() || lfo.phase.abs() > SAFE_CYCLE {
                return Err("Invalid LFO phase".into());
            }
        }
        let mut bounds: Vec<(&str, f64, f64)> = Vec::new();
        for route in &self.routes {
            let lfo = self
                .lfos
                .iter()
                .find(|l| l.id == route.lfo_id)
                .ok_or_else(|| format!("Route references missing LFO: {}", route.lfo_id))?;
            if !name(&route.property)
                || !route.min.is_finite()
                || !route.max.is_finite()
                || route.min > route.max
            {
                return Err("Invalid modulation route".into());
            }
            if !route.enabled || !lfo.enabled || route.min == route.max {
                continue;
            }
            if let Some((_, low, high)) = bounds.iter_mut().find(|(p, _, _)| *p == route.property) {
                *low = low.max(route.min);
                *high = high.min(route.max);
                if *low > *high {
                    return Err(format!(
                        "Conflicting modulation ranges for {}",
                        route.property
                    ));
                }
            } else {
                bounds.push((&route.property, route.min, route.max));
            }
        }
        Ok(())
    }
    pub fn validate_properties(&self, declarations: &Declarations) -> Result<(), String> {
        for route in &self.routes {
            if declarations
                .global(&route.property)
                .and_then(numeric)
                .is_none()
            {
                return Err(format!(
                    "Modulation requires a finite numeric property: {}",
                    route.property
                ));
            }
        }
        Ok(())
    }
    /// Evaluate each oscillator once, producing property-read rules for the frame.
    pub(crate) fn rules(&self, time_ms: f64) -> Result<Vec<PropertyRule>, String> {
        if !time_ms.is_finite() {
            return Err("Invalid LFO timing".into());
        }
        let mut samples = [0.0; MAX_LFOS];
        for (index, lfo) in self.lfos.iter().enumerate() {
            samples[index] = lfo.sample(time_ms, self.bpm, self.beats_per_bar)?;
        }
        let mut rules: Vec<PropertyRule> = Vec::new();
        for route in &self.routes {
            let index = self
                .lfos
                .iter()
                .position(|l| l.id == route.lfo_id)
                .ok_or("Route references missing LFO")?;
            let lfo = &self.lfos[index];
            if !route.enabled || !lfo.enabled || route.min == route.max {
                continue;
            }
            let bipolar = match lfo.polarity {
                Polarity::Bipolar => samples[index],
                Polarity::Unipolar => 2.0 * samples[index] - 1.0,
            };
            let offset = bipolar * (route.max / 2.0 - route.min / 2.0);
            if let Some(rule) = rules.iter_mut().find(|r| r.property == route.property) {
                rule.offset += offset;
                rule.low = rule.low.max(route.min);
                rule.high = rule.high.min(route.max);
                if !rule.offset.is_finite() {
                    return Err("Modulation offset overflow".into());
                }
            } else {
                rules.push(PropertyRule {
                    property: route.property.clone(),
                    offset,
                    low: route.min,
                    high: route.max,
                });
            }
        }
        Ok(rules)
    }
}
impl Lfo {
    pub fn sample(&self, time_ms: f64, bpm: f64, beats_per_bar: f64) -> Result<f64, String> {
        if !time_ms.is_finite()
            || !positive(bpm)
            || !positive(beats_per_bar)
            || !positive(self.bars_per_cycle)
        {
            return Err("Invalid LFO timing".into());
        }
        if !self.enabled {
            return Ok(0.0);
        }
        let cycles =
            (time_ms / 60_000.0) * (bpm / beats_per_bar) / self.bars_per_cycle + self.phase;
        if !cycles.is_finite() || cycles.abs() > SAFE_CYCLE {
            return Err("LFO timeline exceeds safe cycle range".into());
        }
        let t = cycles - cycles.floor();
        let unit = match self.waveform {
            Waveform::Sine => (1.0 + (std::f64::consts::TAU * t).sin()) / 2.0,
            Waveform::Triangle => 1.0 - (2.0 * t - 1.0).abs(),
            Waveform::Square => {
                if t < 0.5 {
                    1.0
                } else {
                    0.0
                }
            }
            Waveform::SawUp => t,
            Waveform::SawDown => 1.0 - t,
            Waveform::SampleHold => {
                // Match JavaScript's ToInt32 and Math.imul, including negative seeks.
                let mut x = cycles.floor().rem_euclid(4_294_967_296.0) as u32 ^ self.seed;
                x = (x ^ (x >> 16)).wrapping_mul(0x7feb352d);
                x = (x ^ (x >> 15)).wrapping_mul(0x846ca68b);
                (x ^ (x >> 16)) as f64 / 4_294_967_296.0
            }
        };
        Ok(match self.polarity {
            Polarity::Bipolar => 2.0 * unit - 1.0,
            Polarity::Unipolar => unit,
        })
    }
}
