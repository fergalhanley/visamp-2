//! One immutable clock snapshot for all reads during a frame and its capture.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Calendar {
    pub hour: u32,
    pub minute: u32,
    pub day: u32,
    pub month: u32,
    pub year: i32,
}
impl Calendar {
    pub fn local_now() -> Self {
        #[cfg(target_arch = "wasm32")]
        {
            let d = js_sys::Date::new_0();
            Self {
                hour: d.get_hours(),
                minute: d.get_minutes(),
                day: d.get_day(),
                month: d.get_month(),
                year: d.get_full_year() as i32,
            }
        }
        #[cfg(not(target_arch = "wasm32"))]
        {
            use chrono::{Datelike, Timelike};
            let d = chrono::Local::now();
            Self {
                hour: d.hour(),
                minute: d.minute(),
                day: d.weekday().num_days_from_sunday(),
                month: d.month0(),
                year: d.year(),
            }
        }
    }
}
#[derive(Clone, Debug)]
pub struct FrameClock {
    pub index: u64,
    pub elapsed_ms: f64,
    pub delta_sec: f64,
    pub calendar: Calendar,
    last_ms: Option<f64>,
    started: bool,
    host_ms: Option<f64>,
    paused: bool,
    external_ms: Option<f64>,
}
impl Default for FrameClock {
    fn default() -> Self {
        Self::new(crate::utils::start_time_ms() as f64, Calendar::local_now())
    }
}
impl FrameClock {
    pub fn new(elapsed_ms: f64, calendar: Calendar) -> Self {
        Self {
            index: 0,
            elapsed_ms,
            delta_sec: 0.0,
            calendar,
            last_ms: None,
            started: false,
            host_ms: None,
            paused: false,
            external_ms: None,
        }
    }
    pub fn pause(&mut self) {
        self.last_ms = None;
        self.host_ms = None;
    }
    /// Pause the animation timeline; the next resume excludes time spent paused.
    pub fn set_paused(&mut self, paused: bool) {
        if self.paused != paused {
            self.pause();
        }
        self.paused = paused;
    }
    /// Host timeline ownership, including seeking and offline sampling. None
    /// returns to automatic advancement from the current position.
    pub fn set_time(&mut self, time_ms: Option<f64>) -> Result<(), String> {
        if time_ms.is_some_and(|t| !t.is_finite()) {
            return Err("animation time must be finite".into());
        }
        if self.external_ms.is_some() != time_ms.is_some() {
            self.pause();
        }
        self.external_ms = time_ms;
        Ok(())
    }
    pub fn reset_frame_index(&mut self) {
        self.index = 0;
        self.started = false;
        self.last_ms = None;
        self.delta_sec = 0.0;
    }
    /// Called exactly once per rendered frame. Host timestamps are a source
    /// for the shared clock, never individual oscillator clocks.
    pub fn advance(&mut self, host_ms: f64, calendar: Calendar) {
        let delta = self
            .host_ms
            .map(|last| (host_ms - last).max(0.0))
            .unwrap_or(0.0);
        self.host_ms = Some(host_ms);
        let time = self
            .external_ms
            .unwrap_or_else(|| self.elapsed_ms + if self.paused { 0.0 } else { delta });
        self.begin_frame(time, calendar);
    }
    pub fn begin_frame(&mut self, elapsed_ms: f64, calendar: Calendar) {
        if self.started {
            self.index = self.index.saturating_add(1);
        }
        self.started = true;
        self.delta_sec = self
            .last_ms
            .map(|last| ((elapsed_ms - last) / 1000.0).max(0.0))
            .unwrap_or(0.0);
        self.last_ms = Some(elapsed_ms);
        self.elapsed_ms = elapsed_ms;
        self.calendar = calendar;
    }
}
