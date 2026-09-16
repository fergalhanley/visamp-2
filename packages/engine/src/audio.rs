//! Immutable normalized audio snapshots, latched once per rendered frame.
use std::rc::Rc;

#[derive(Clone, Debug)]
pub struct Snapshot {
    pub waveform: Rc<Vec<f32>>,
    pub spectrum: Rc<Vec<f32>>,
    power_prefix: Rc<Vec<f64>>,
    pub sample_rate: f64,
    pub level: f64,
    pub beat: bool,
    pub onset: bool,
    pub onset_strength: f64,
}
impl Default for Snapshot {
    fn default() -> Self {
        Self {
            waveform: Rc::new(vec![0.0; 1024]),
            spectrum: Rc::new(vec![0.0; 1024]),
            power_prefix: Rc::new(vec![0.0; 1025]),
            sample_rate: 48000.0,
            level: 0.0,
            beat: false,
            onset: false,
            onset_strength: 0.0,
        }
    }
}
impl Snapshot {
    pub fn new(
        waveform: &[f32],
        spectrum: &[f32],
        sample_rate: f64,
        level: f64,
        beat: bool,
        onset: bool,
        onset_strength: f64,
    ) -> Result<Self, String> {
        if !sample_rate.is_finite()
            || sample_rate <= 0.0
            || waveform.len() > 32768
            || spectrum.is_empty()
            || spectrum.len() > 16384
        {
            return Err("invalid audio snapshot dimensions or sample rate".into());
        }
        let clean = |v: f32, low: f32| {
            if v.is_finite() {
                v.clamp(low, 1.0)
            } else {
                0.0
            }
        };
        let spectrum: Vec<_> = spectrum.iter().map(|&v| clean(v, 0.0)).collect();
        let mut prefix = Vec::with_capacity(spectrum.len() + 1);
        prefix.push(0.0);
        for &v in &spectrum {
            prefix.push(prefix.last().unwrap() + (v as f64).powi(2));
        }
        Ok(Self {
            waveform: Rc::new(waveform.iter().map(|&v| clean(v, -1.0)).collect()),
            spectrum: Rc::new(spectrum),
            power_prefix: Rc::new(prefix),
            sample_rate,
            level: unit(level),
            beat,
            onset,
            onset_strength: unit(onset_strength),
        })
    }
    /// RMS spectral magnitude over [low, high), with fractional bin overlap.
    /// Prefix sums make repeated custom-band reads constant time.
    pub fn band(&self, low: f64, high: f64) -> Result<f64, String> {
        if !low.is_finite() || !high.is_finite() || low < 0.0 || high <= low {
            return Err(
                "audio::detect::get_band_level: require finite 0 <= low_hz < high_hz".into(),
            );
        }
        let n = self.spectrum.len() as f64;
        let start = (low / (self.sample_rate / 2.0) * n).min(n);
        let end = (high / (self.sample_rate / 2.0) * n).min(n);
        if end <= start {
            return Ok(0.0);
        }
        let integral = |x: f64| {
            let i = x.floor() as usize;
            self.power_prefix[i]
                + self
                    .spectrum
                    .get(i)
                    .map(|v| (*v as f64).powi(2) * (x - i as f64))
                    .unwrap_or(0.0)
        };
        Ok(((integral(end) - integral(start)).max(0.0) / (end - start))
            .sqrt()
            .clamp(0.0, 1.0))
    }
}
fn unit(v: f64) -> f64 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

#[derive(Clone, Default)]
pub struct AudioState {
    pub current: Snapshot,
    pub frequency: Frequency,
    pending_frequency: Option<Frequency>,
    pending: Option<Snapshot>,
    beat: bool,
    onset: bool,
    strength: f64,
}
impl AudioState {
    pub fn push(&mut self, snapshot: Snapshot) {
        self.beat |= snapshot.beat;
        self.onset |= snapshot.onset;
        self.strength = self.strength.max(snapshot.onset_strength);
        self.pending = Some(snapshot);
    }
    pub fn push_frequency(&mut self, values: &[u8]) -> Result<(), String> {
        if values.len() != 1024 {
            return Err("frequency snapshot must contain exactly 1024 bins".into());
        }
        self.pending_frequency = Some(Frequency(Rc::new(values.to_vec())));
        Ok(())
    }
    pub fn begin_frame(&mut self) {
        if let Some(frequency) = self.pending_frequency.take() {
            self.frequency = frequency;
        }
        if let Some(snapshot) = self.pending.take() {
            self.current = snapshot;
        }
        self.current.beat = std::mem::take(&mut self.beat);
        self.current.onset = std::mem::take(&mut self.onset);
        self.current.onset_strength = std::mem::take(&mut self.strength);
    }
}

/// Immutable browser byte-frequency bins, independent of the linear spectrum.
#[derive(Clone)]
pub struct Frequency(pub Rc<Vec<u8>>);
impl Default for Frequency {
    fn default() -> Self {
        Self(Rc::new(vec![0; 1024]))
    }
}
