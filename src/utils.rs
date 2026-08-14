use js_sys::Date;
use std::sync::OnceLock;

static START_MS: OnceLock<u128> = OnceLock::new();

pub fn time_ms() -> u128 {
    Date::now() as u128
}

/// Elapsed time in ms since the first time this function was called.
pub fn start_time_ms() -> u128 {
    let start = START_MS.get_or_init(|| time_ms());
    time_ms() - *start
}
