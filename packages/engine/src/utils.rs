use std::sync::OnceLock;

static START_MS: OnceLock<u128> = OnceLock::new();

/// Wall-clock milliseconds.
///
/// `Date::now` is a wasm-bindgen import and traps when called off the web, so
/// native builds — tests and benchmarks — take the system clock instead. Without
/// this, any script mentioning `$TIME_MS` could only be run in a browser.
#[cfg(target_arch = "wasm32")]
pub fn time_ms() -> u128 {
    js_sys::Date::now() as u128
}

#[cfg(not(target_arch = "wasm32"))]
pub fn time_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Elapsed time in ms since the first time this function was called.
pub fn start_time_ms() -> u128 {
    let start = START_MS.get_or_init(time_ms);
    time_ms() - *start
}
