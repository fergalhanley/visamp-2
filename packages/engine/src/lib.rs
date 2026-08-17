use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::CanvasRenderingContext2d;

pub mod model;
pub mod utils;
pub mod parser;
pub mod interpreter;

use model::*;
use parser::build_ast;
use interpreter::*;

struct AppState {
    model: RefCell<Model>,
    runtime: RefCell<Runtime>,
    ctx: CanvasRenderingContext2d,
    last_error: RefCell<Option<String>>,
}

thread_local! {
    static STATE: RefCell<Option<Rc<AppState>>> = RefCell::new(None);
    static INITIALIZED: RefCell<bool> = RefCell::new(false);
}

#[wasm_bindgen(start)]
pub fn main_web() {
    // Prevent multiple initializations (e.g., from webpack HMR)
    let already_initialized = INITIALIZED.with(|init| {
        if *init.borrow() {
            true
        } else {
            *init.borrow_mut() = true;
            false
        }
    });
    
    if already_initialized {
        web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str("main_web() called multiple times, ignoring"));
        return;
    }

    console_error_panic_hook::set_once();

    // Wrap initialization in error handling
    if let Err(e) = std::panic::catch_unwind(init_app) {
        let msg = if let Some(s) = e.downcast_ref::<String>() {
            s.clone()
        } else if let Some(s) = e.downcast_ref::<&str>() {
            s.to_string()
        } else {
            "Unknown initialization error".to_string()
        };
        web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&format!("Initialization failed: {}", msg)));
        
        // Display error on page
        if let Some(window) = web_sys::window() {
            if let Some(document) = window.document() {
                if let Some(body) = document.body() {
                    let error_div = document.create_element("div").unwrap();
                    error_div.set_attribute("style", "position:fixed;top:0;left:0;right:0;background:#ff0000;color:white;padding:20px;font-family:monospace;z-index:9999;").unwrap();
                    error_div.set_text_content(Some(&format!("Initialization Error: {}", msg)));
                    body.append_child(&error_div).unwrap();
                }
            }
        }
    }
}

fn init_app() -> Result<(), String> {
    let document = web_sys::window()
        .ok_or("No window object")?
        .document()
        .ok_or("No document object")?;

    let canvas = document
        .get_element_by_id("canvas")
        .ok_or("No #canvas element found")?
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .map_err(|_| "Element is not a canvas")?;

    let ctx: CanvasRenderingContext2d = canvas
        .get_context("2d")
        .map_err(|_| "Failed to get 2d context")?
        .ok_or("2d context is null")?
        .dyn_into()
        .map_err(|_| "Failed to cast to CanvasRenderingContext2d")?;

    let canvas_width = canvas.client_width() as f64;
    let canvas_height = canvas.client_height() as f64;
    canvas.set_width(canvas_width as u32);
    canvas.set_height(canvas_height as u32);

    web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(&format!("Canvas size: {}x{}", canvas_width, canvas_height)));

    let default_script = r#"
prop angle = 0.0

on_frame {
  angle = $TIME_SEC
}

layer_2d {
  draw::clear()
  draw::background(
    color: $COLOR_BLACK
  )
  draw::rect (
    x: 350.0,
    y: 250.0,
    width: 100.0,
    height: 100.0,
    color: $COLOR_BLUE,
    rotate: angle
  )
  draw::circle (
    x: 400.0,
    y: 300.0,
    radius: 30.0,
    color: $COLOR_RED
  )
  draw::polygon (
    points: [
      [400.0, 200.0],
      [300.0, 400.0],
      [500.0, 400.0],
    ],
    color: $COLOR_GREEN,
    rotate: angle
  )
  draw::text (
    content: "visamp",
    x: 340.0,
    y: 500.0,
    size: 24.0,
    color: $COLOR_WHITE
  )
}
"#;

    let ast = build_ast(default_script).map_err(|e| format!("Failed to parse default script: {}", e))?;
    let model = Model::from_script(&ast);

    let mut runtime = Runtime::new();
    runtime.canvas_width = canvas_width;
    runtime.canvas_height = canvas_height;

    let state = Rc::new(AppState {
        model: RefCell::new(model),
        runtime: RefCell::new(runtime),
        ctx,
        last_error: RefCell::new(None),
    });

    // Set up mouse tracking
    {
        let state_clone = state.clone();
        let canvas_clone = canvas.clone();
        let closure = Closure::<dyn FnMut(web_sys::MouseEvent)>::new(move |e: web_sys::MouseEvent| {
            let rect = canvas_clone.get_bounding_client_rect();
            let mut rt = state_clone.runtime.borrow_mut();
            rt.mouse_x = e.client_x() as f64 - rect.left();
            rt.mouse_y = e.client_y() as f64 - rect.top();
        });
        canvas.add_event_listener_with_callback("mousemove", closure.as_ref().unchecked_ref())
            .unwrap();
        closure.forget();
    }

    STATE.with(|s| {
        *s.borrow_mut() = Some(state.clone());
    });

    // Start animation loop
    let f: Rc<RefCell<Option<Closure<dyn FnMut()>>>> = Rc::new(RefCell::new(None));
    let g = f.clone();
    let state_ref = state.clone();

    *g.borrow_mut() = Some(Closure::new(move || {
        // Schedule next frame first to keep animation running
        request_animation_frame(f.borrow().as_ref().unwrap());
        
        let mut model = state_ref.model.borrow_mut();
        let mut runtime = state_ref.runtime.borrow_mut();
        runtime.frame_count += 1;

        let blocks = model.blocks.clone();
        let functions = model.functions.clone();

        // Log model info every 60 frames to verify model replacement
        if runtime.frame_count % 60 == 1 {
            let block_info: Vec<String> = blocks.iter().map(|b| {
                format!("{:?}({} stmts)", b.block_type, b.statements.len())
            }).collect();
            web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(
                &format!("Frame {}: blocks=[{}], functions={}", runtime.frame_count, block_info.join(", "), functions.len())
            ));
        }

        // Run on_frame blocks
        for block in &blocks {
            if block.block_type == BlockType::OnFrame {
                if let Err(e) = interpret_event_block(block, &mut model.decels, &*runtime, &functions) {
                    web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&format!("on_frame error: {}", e)));
                    *state_ref.last_error.borrow_mut() = Some(e);
                }
            }
        }

        // Run layer_2d blocks
        for block in &blocks {
            if block.block_type == BlockType::Layer2D {
                if let Err(e) = interpret_layer_block(block, &mut model.decels, &state_ref.ctx, &*runtime, &functions) {
                    web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&format!("layer_2d error: {}", e)));
                    *state_ref.last_error.borrow_mut() = Some(e);
                }
            }
        }
    }));

    request_animation_frame(g.borrow().as_ref().unwrap());
    
    web_sys::console::log_1(&wasm_bindgen::JsValue::from_str("Visamp initialized successfully"));
    Ok(())
}

fn request_animation_frame(f: &Closure<dyn FnMut()>) {
    web_sys::window()
        .unwrap()
        .request_animation_frame(f.as_ref().unchecked_ref())
        .unwrap();
}

/// Load a new DSL script from JavaScript. Returns error message or empty string.
#[wasm_bindgen]
pub fn load_script(code: &str) -> String {
    web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(&format!("load_script called with {} chars", code.len())));
    match build_ast(code) {
        Ok(ast) => {
            let model = Model::from_script(&ast);
            let block_info: Vec<String> = model.blocks.iter().map(|b| {
                format!("{:?}({} stmts)", b.block_type, b.statements.len())
            }).collect();
            web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(
                &format!("Parsed OK: blocks=[{}], functions={}", block_info.join(", "), model.functions.len())
            ));
            STATE.with(|s| {
                if let Some(ref state) = *s.borrow() {
                    *state.model.borrow_mut() = model;
                    *state.last_error.borrow_mut() = None;
                    web_sys::console::log_1(&wasm_bindgen::JsValue::from_str("Model updated in STATE"));
                } else {
                    web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str("STATE is None!"));
                }
            });
            String::new()
        }
        Err(e) => {
            web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(&format!("Parse error: {}", e)));
            STATE.with(|s| {
                if let Some(ref state) = *s.borrow() {
                    *state.last_error.borrow_mut() = Some(e.clone());
                }
            });
            e
        }
    }
}

/// Thumbnails are captured at a fixed size so they never inherit whatever
/// window the author happened to have open.
const CAPTURE_WIDTH: u32 = 1280;
const CAPTURE_HEIGHT: u32 = 720;

/// Renders the current model once into a detached 1280x720 canvas.
fn render_capture_canvas() -> Result<web_sys::HtmlCanvasElement, String> {
    let state = STATE
        .with(|s| s.borrow().clone())
        .ok_or("Engine is not initialised")?;

    let document = web_sys::window()
        .ok_or("No window object")?
        .document()
        .ok_or("No document object")?;

    // Detached from the DOM: never appended, so it cannot disturb the layout.
    let canvas: web_sys::HtmlCanvasElement = document
        .create_element("canvas")
        .map_err(|_| "Could not create canvas")?
        .dyn_into()
        .map_err(|_| "Element is not a canvas")?;
    canvas.set_width(CAPTURE_WIDTH);
    canvas.set_height(CAPTURE_HEIGHT);

    let ctx: CanvasRenderingContext2d = canvas
        .get_context("2d")
        .map_err(|_| "Failed to get 2d context")?
        .ok_or("2d context is null")?
        .dyn_into()
        .map_err(|_| "Failed to cast to CanvasRenderingContext2d")?;

    // Report the capture size to the script, so anything positioned with
    // $WIDTH / $HEIGHT composes for 1280x720 rather than for the on-screen
    // canvas. This is the whole point of a fixed capture size.
    let runtime = {
        let live = state.runtime.borrow();
        let mut snapshot = live.clone();
        snapshot.canvas_width = CAPTURE_WIDTH as f64;
        snapshot.canvas_height = CAPTURE_HEIGHT as f64;
        snapshot
    };

    let mut model = state.model.borrow_mut();
    let blocks = model.blocks.clone();
    let functions = model.functions.clone();

    // Only layer blocks run. on_frame is deliberately skipped: a capture is a
    // snapshot of the current state, not a step forward in time.
    for block in blocks.iter().filter(|b| b.block_type == BlockType::Layer2D) {
        interpret_layer_block(block, &mut model.decels, &ctx, &runtime, &functions)
            .map_err(|e| format!("Capture failed: {}", e))?;
    }

    Ok(canvas)
}

/// Capture the current frame as a PNG `Blob` at a fixed 1280x720.
///
/// Returns a `Promise<Blob>` because `HTMLCanvasElement.toBlob` is asynchronous.
#[wasm_bindgen]
pub fn capture_frame() -> js_sys::Promise {
    let canvas = match render_capture_canvas() {
        Ok(canvas) => canvas,
        Err(message) => {
            return js_sys::Promise::reject(&JsValue::from_str(&message));
        }
    };

    js_sys::Promise::new(&mut |resolve, reject| {
        // Held by the callback so the canvas outlives this scope and is still
        // around when the browser finishes encoding.
        let keep_alive = canvas.clone();
        let reject_on_null = reject.clone();

        let callback = Closure::once_into_js(move |blob: JsValue| {
            drop(keep_alive);

            if blob.is_null() || blob.is_undefined() {
                let _ = reject_on_null.call1(
                    &JsValue::NULL,
                    &JsValue::from_str("Canvas produced no blob"),
                );
            } else {
                let _ = resolve.call1(&JsValue::NULL, &blob);
            }
        });

        if canvas
            .to_blob_with_type(callback.unchecked_ref(), "image/png")
            .is_err()
        {
            let _ = reject.call1(
                &JsValue::NULL,
                &JsValue::from_str("toBlob is unavailable in this browser"),
            );
        }
    })
}

/// Get the last error, if any.
#[wasm_bindgen]
pub fn get_last_error() -> String {
    STATE.with(|s| {
        if let Some(ref state) = *s.borrow() {
            state.last_error.borrow().clone().unwrap_or_default()
        } else {
            String::new()
        }
    })
}
