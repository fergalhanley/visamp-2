use wasm_bindgen::prelude::wasm_bindgen;

use visamp::run_app;

mod visamp;

// web app entry_point
#[wasm_bindgen(start)]
pub async fn main_web() {
    web_sys::console::log_1(&format!("main_web").into());
    console_error_panic_hook::set_once();
    run_app().await;
}
