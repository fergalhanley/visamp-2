use std::cell::RefCell;
use std::rc::Rc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::CanvasRenderingContext2d;

pub mod builtins;
pub mod geometry;
pub mod math3;
pub mod model;
pub mod utils;
pub mod parser;
pub mod renderer;
pub mod scene;
pub mod resolver;
pub mod interpreter;

use model::*;
use renderer::Renderer;
use scene::Scene;
use parser::build_ast;
use interpreter::*;

/// What the canvas has actually been bound to.
///
/// A canvas keeps whichever context it is first given for its whole life, so
/// this cannot be chosen at startup — the script decides, and the script is not
/// loaded yet. It is acquired on the first `load_script` and fixed from then on.
enum Backend {
    TwoD(CanvasRenderingContext2d),
    ThreeD(Renderer),
}

struct AppState {
    model: RefCell<Model>,
    runtime: RefCell<Runtime>,
    /// The element the engine draws inside. Owned by the page and never
    /// replaced.
    host: web_sys::Element,
    /// The canvas the engine created inside the host.
    ///
    /// Replaceable, because a canvas keeps whichever context it was first given
    /// for its whole life. Switching a script between `context 2d` and
    /// `context 3d` therefore means a *new* canvas, which is why the engine
    /// owns this element rather than the page: swapping a node React rendered
    /// would break React's own cleanup.
    canvas: RefCell<Option<web_sys::HtmlCanvasElement>>,
    kind: RefCell<Option<ContextKind>>,
    backend: RefCell<Option<Backend>>,
    /// Rebuilt from scratch every 3d frame; see `Scene::reset`.
    scene: RefCell<Scene>,
    last_error: RefCell<Option<String>>,
}

/// The element the page gives the engine to draw inside.
const HOST_ID: &str = "visamp-stage";

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

    let host = document
        .get_element_by_id(HOST_ID)
        .ok_or("No #visamp-stage element found")?;

    // No canvas yet, and deliberately no context: both depend on what the
    // script asks for, and the script has not been loaded.
    let canvas_width = host.client_width() as f64;
    let canvas_height = host.client_height() as f64;

    web_sys::console::log_1(&wasm_bindgen::JsValue::from_str(&format!("Canvas size: {}x{}", canvas_width, canvas_height)));

    // Nothing to draw until the page loads a script. The engine used to carry a
    // demo of its own, which meant every host briefly rendered something it had
    // not asked for; the default now belongs to whoever embeds the engine.
    let model = Model::from_script(&Script::new());

    let mut runtime = Runtime::new();
    runtime.canvas_width = canvas_width;
    runtime.canvas_height = canvas_height;

    let state = Rc::new(AppState {
        model: RefCell::new(model),
        runtime: RefCell::new(runtime),
        host: host.clone(),
        canvas: RefCell::new(None),
        kind: RefCell::new(None),
        backend: RefCell::new(None),
        scene: RefCell::new(Scene::default()),
        last_error: RefCell::new(None),
    });

    // Mouse tracking hangs off the host, not the canvas, so it survives the
    // canvas being replaced on a context switch.
    {
        let state_clone = state.clone();
        let host_clone = host.clone();
        let closure = Closure::<dyn FnMut(web_sys::MouseEvent)>::new(move |e: web_sys::MouseEvent| {
            let rect = host_clone.get_bounding_client_rect();
            let mut rt = state_clone.runtime.borrow_mut();
            rt.mouse_x = e.client_x() as f64 - rect.left();
            rt.mouse_y = e.client_y() as f64 - rect.top();
        });
        host.add_event_listener_with_callback("mousemove", closure.as_ref().unchecked_ref())
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
        
        // Skipping a frame is invisible; panicking here is not. A capture or a
        // property read holding the state briefly should cost one frame, not
        // abort mid-borrow and leave every later frame unable to run.
        let (Ok(mut model), Ok(mut runtime)) =
            (state_ref.model.try_borrow_mut(), state_ref.runtime.try_borrow_mut())
        else {
            return;
        };
        runtime.frame_count += 1;

        // Borrowed apart rather than cloned. The script's blocks and functions
        // do not change between frames, so copying the whole AST sixty times a
        // second bought nothing but allocator traffic — it was only ever there
        // to get a second borrow of the model alongside `decels`.
        let Model {
            blocks,
            functions,
            decels,
            ..
        } = &mut *model;

        // on_frame always runs to completion before render, so a render block
        // always draws from state that is current for this frame.
        for block in blocks.iter() {
            if block.block_type == BlockType::OnFrame {
                if let Err(e) = interpret_event_block(block, decels, &*runtime, functions) {
                    *state_ref.last_error.borrow_mut() = Some(e);
                }
            }
        }

        // Nothing has claimed the canvas yet, which means no script has loaded.
        let mut backend = state_ref.backend.borrow_mut();
        let Some(backend) = backend.as_mut() else {
            return;
        };

        match backend {
            Backend::TwoD(ctx) => {
                for block in blocks.iter().filter(|b| b.block_type == BlockType::Render) {
                    if let Err(e) = interpret_render_block(
                        block,
                        decels,
                        Target::canvas(ctx),
                        &*runtime,
                        functions,
                    ) {
                        *state_ref.last_error.borrow_mut() = Some(e);
                    }
                }
            }

            Backend::ThreeD(renderer) => {
                // §9.1 — every frame starts from the default scene, so nothing
                // leaks between frames and live editing stays predictable.
                state_ref.scene.borrow_mut().reset();

                let mut failure = None;
                for block in blocks.iter().filter(|b| b.block_type == BlockType::Render) {
                    if let Err(e) = interpret_render_block(
                        block,
                        decels,
                        Target::scene(&state_ref.scene),
                        &*runtime,
                        functions,
                    ) {
                        failure = Some(e);
                        break;
                    }
                }

                // An unbalanced stack is a mistake worth naming even though the
                // reset above would hide it from the next frame.
                if failure.is_none() {
                    if let Err(e) = state_ref.scene.borrow().check_balanced() {
                        failure = Some(e);
                    }
                }

                let scene = state_ref.scene.borrow();
                for warning in &scene.warnings {
                    web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str(warning));
                }

                // A failed frame still renders what it managed to record, so
                // the canvas shows partial work rather than going black.
                let (width, height) = match state_ref.canvas.borrow().as_ref() {
                    Some(canvas) => (canvas.width(), canvas.height()),
                    None => (0, 0),
                };
                if let Err(e) = renderer.render(&scene, width, height) {
                    failure = Some(e);
                }

                if let Some(e) = failure {
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
            // Give the script the context it asked for, replacing the canvas
            // when that differs from the one currently mounted. A canvas keeps
            // its first context for life, so switching between 2d and 3d is
            // only possible by mounting a new element.
            let claimed = STATE.with(|s| -> Result<(), String> {
                let borrowed = s.borrow();
                let Some(state) = borrowed.as_ref() else {
                    return Err("Engine is not initialised".to_string());
                };

                if *state.kind.borrow() == Some(model.context) {
                    return Ok(());
                }

                mount_canvas(state, model.context)
            });

            if let Err(message) = claimed {
                STATE.with(|s| {
                    if let Some(ref state) = *s.borrow() {
                        *state.last_error.borrow_mut() = Some(message.clone());
                    }
                });
                return message;
            }

            STATE.with(|s| {
                if let Some(ref state) = *s.borrow() {
                    *state.model.borrow_mut() = model;
                    *state.last_error.borrow_mut() = None;
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

    // A capture renders into a fresh detached canvas, which means a fresh 2d
    // context. There is no 3d equivalent yet, and quietly returning an empty
    // image would be worse than saying so.
    if *state.kind.borrow() == Some(ContextKind::ThreeD) {
        return Err("Capturing a frame is not supported in 3d mode yet".to_string());
    }

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
    for block in blocks.iter().filter(|b| b.block_type == BlockType::Render) {
        interpret_render_block(block, &mut model.decels, Target::canvas(&ctx), &runtime, &functions)
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

/// Hand the engine the latest analyser snapshot.
///
/// Called once per animation frame from the player wrapper, which owns the
/// AnalyserNode. Pushing rather than pulling keeps the audio graph entirely on
/// the JavaScript side: the engine never needs to know whether the signal came
/// from a microphone, a local file or a stream.
///
/// `time_domain` is the waveform (centred on 128), `frequency` the spectrum,
/// both 0..255. A frame that arrives while the script is mid-render is simply
/// seen on the next frame; there is no tearing because the copy completes
/// before the render loop reads it.
#[wasm_bindgen]
pub fn set_audio_frame(time_domain: &[u8], frequency: &[u8], beat: bool) {
    STATE.with(|s| {
        if let Some(ref state) = *s.borrow() {
            // try_borrow_mut: the render loop holds this briefly each frame, and
            // dropping one audio frame is far better than panicking.
            if let Ok(mut runtime) = state.runtime.try_borrow_mut() {
                // Replaced rather than refilled: a script may still be holding
                // the previous buffer, and one allocation a frame is nothing
                // beside what sharing it saves.
                runtime.time_domain = std::rc::Rc::new(time_domain.to_vec());
                runtime.frequency = std::rc::Rc::new(frequency.to_vec());
                runtime.beat = beat;
            }
        }
    });
}

/// Clears the analyser snapshot, so scripts see silence rather than the last
/// frame frozen in place.
#[wasm_bindgen]
pub fn clear_audio_frame() {
    STATE.with(|s| {
        if let Some(ref state) = *s.borrow() {
            if let Ok(mut runtime) = state.runtime.try_borrow_mut() {
                runtime.time_domain = std::rc::Rc::new(Vec::new());
                runtime.frequency = std::rc::Rc::new(Vec::new());
                runtime.beat = false;
            }
        }
    });
}

/// JSON-escapes a string for the hand-built payload in `get_properties`.
fn json_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

/// A snapshot of every declared property and its current value.
///
/// Returns a JSON array of `{name, type, value, swatch?}`, in declaration
/// order. This is a *pull*, not a push: properties are reassigned on every
/// frame, so emitting an event per change would mean thousands of boundary
/// crossings a second to feed a panel a human reads a few times a second.
/// The caller polls this and diffs, which turns into a change event on the JS
/// side at a fraction of the cost.
#[wasm_bindgen]
pub fn get_properties() -> String {
    STATE.with(|s| {
        let borrowed = s.borrow();
        let Some(ref state) = *borrowed else {
            return "[]".to_string();
        };

        // A frame in flight holds this mutably; skipping a poll is invisible,
        // whereas panicking here would take the whole editor down.
        let Ok(model) = state.model.try_borrow() else {
            return "[]".to_string();
        };

        // Properties live in the outermost scope; block scopes sit above it.
        let entries: Vec<String> = model
            .prop_names
            .iter()
            .filter_map(|name| model.decels.global(name).map(|value| (name, value)))
            .map(|(name, value)| {
                let swatch = match value {
                    Value::Color(c) => format!(
                        ",\"swatch\":\"#{:02x}{:02x}{:02x}\"",
                        (c.r.clamp(0.0, 1.0) * 255.0).round() as u8,
                        (c.g.clamp(0.0, 1.0) * 255.0).round() as u8,
                        (c.b.clamp(0.0, 1.0) * 255.0).round() as u8
                    ),
                    _ => String::new(),
                };
                format!(
                    "{{\"name\":\"{}\",\"type\":\"{}\",\"value\":\"{}\"{}}}",
                    json_escape(name),
                    value.type_tag(),
                    json_escape(&value.display()),
                    swatch
                )
            })
            .collect();

        format!("[{}]", entries.join(","))
    })
}

/// Creates the canvas the given context needs and hangs it inside the host,
/// discarding whatever was there before.
///
/// Replacing the element is the only way to change context: `getContext("2d")`
/// on a canvas that has already handed out a WebGL context returns null, and
/// vice versa. The old canvas and its GPU resources are collected once it
/// leaves the document.
fn mount_canvas(state: &AppState, kind: ContextKind) -> Result<(), String> {
    let document = web_sys::window()
        .ok_or("No window object")?
        .document()
        .ok_or("No document object")?;

    let canvas = document
        .create_element("canvas")
        .map_err(|_| "Failed to create a canvas".to_string())?
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .map_err(|_| "Failed to cast the new canvas".to_string())?;

    // The host carries the layout; the canvas simply fills it.
    canvas
        .set_attribute("style", "display:block;width:100%;height:100%")
        .map_err(|_| "Failed to style the canvas".to_string())?;

    let width = state.host.client_width().max(1) as u32;
    let height = state.host.client_height().max(1) as u32;
    canvas.set_width(width);
    canvas.set_height(height);

    // Build the backend before touching the document, so a failure leaves the
    // previous canvas rendering rather than emptying the host.
    let backend = match kind {
        ContextKind::TwoD => {
            let ctx = canvas
                .get_context("2d")
                .map_err(|_| "Failed to get a 2d context".to_string())?
                .ok_or("2d context is null")?
                .dyn_into::<CanvasRenderingContext2d>()
                .map_err(|_| "Failed to cast the 2d context".to_string())?;
            Backend::TwoD(ctx)
        }
        ContextKind::ThreeD => {
            let gl = canvas
                .get_context("webgl2")
                .map_err(|_| "Failed to get a webgl2 context".to_string())?
                .ok_or("this browser has no WebGL2")?
                .dyn_into::<web_sys::WebGl2RenderingContext>()
                .map_err(|_| "Failed to cast the webgl2 context".to_string())?;
            Backend::ThreeD(Renderer::new(gl)?)
        }
    };

    if let Some(previous) = state.canvas.borrow().as_ref() {
        let _ = state.host.remove_child(previous);
    }
    state
        .host
        .append_child(&canvas)
        .map_err(|_| "Failed to attach the canvas".to_string())?;

    {
        let mut runtime = state.runtime.borrow_mut();
        runtime.canvas_width = width as f64;
        runtime.canvas_height = height as f64;
    }

    *state.canvas.borrow_mut() = Some(canvas);
    *state.backend.borrow_mut() = Some(backend);
    *state.kind.borrow_mut() = Some(kind);
    state.scene.borrow_mut().reset();

    Ok(())
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
