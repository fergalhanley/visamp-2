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
    #[cfg(target_arch = "wasm32")]
    {
        static START: std::sync::OnceLock<f64> = std::sync::OnceLock::new();
        let now = web_sys::window()
            .and_then(|w| w.performance())
            .map(|p| p.now())
            .unwrap_or_else(js_sys::Date::now);
        (now - *START.get_or_init(|| now)).max(0.0) as u128
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        START
            .get_or_init(std::time::Instant::now)
            .elapsed()
            .as_millis()
    }
}
