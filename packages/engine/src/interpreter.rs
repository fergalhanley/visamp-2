use web_sys::CanvasRenderingContext2d;

use std::cell::RefCell;

use crate::math3::Mat4;
use crate::scene::*;
use crate::model::*;
use crate::utils::start_time_ms;

#[derive(Clone)]
pub struct Runtime {
    pub frame_count: u64,
    pub canvas_width: f64,
    pub canvas_height: f64,
    pub mouse_x: f64,
    pub mouse_y: f64,

    /// Latest analyser snapshot, pushed in from JS via `set_audio_frame`.
    /// Empty until an audio source is connected, which is what makes a script
    /// referencing `$FREQUENCY_DATA` degrade to an empty loop rather than fail.
    pub time_domain: std::rc::Rc<Vec<u8>>,
    pub frequency: std::rc::Rc<Vec<u8>>,
    pub beat: bool,
}

impl Runtime {
    pub fn new() -> Self {
        Runtime {
            frame_count: 0,
            canvas_width: 800.0,
            canvas_height: 600.0,
            mouse_x: 0.0,
            mouse_y: 0.0,
            time_domain: std::rc::Rc::new(Vec::new()),
            frequency: std::rc::Rc::new(Vec::new()),
            beat: false,
        }
    }
}

/// Byte analyser data as a DSL array. Allocates, so callers should bind it to a
/// `let` rather than re-reading it inside a loop.
/// Hands the script the audio buffer without copying it.
fn byte_array_value(bytes: &std::rc::Rc<Vec<u8>>) -> Value {
    Value::Bytes(std::rc::Rc::clone(bytes))
}

type InterpResult<T> = Result<T, String>;

thread_local! {
    /// Scratch space for CSS colour strings, reused across every draw call.
    static CSS: RefCell<String> = RefCell::new(String::with_capacity(24));
}

/// Sets the fill style without allocating a `String` or a `JsValue`.
fn set_fill(ctx: &CanvasRenderingContext2d, color: Color) {
    CSS.with(|buf| {
        let mut css = buf.borrow_mut();
        css.clear();
        color.write_css(&mut css);
        ctx.set_fill_style_str(&css);
    });
}

fn set_stroke(ctx: &CanvasRenderingContext2d, color: Color) {
    CSS.with(|buf| {
        let mut css = buf.borrow_mut();
        css.clear();
        color.write_css(&mut css);
        ctx.set_stroke_style_str(&css);
    });
}

/// Hard stop on range length. The interpreter runs inside the frame loop, so a
/// runaway range would lock the tab — and the editor recompiles as you type,
/// which means a half-finished number like `0..100000` is easy to produce by
/// accident. Erring here beats freezing.
const MAX_RANGE_ITERATIONS: i64 = 100_000;

/// Ranges are integers only, so a float bound is rejected rather than rounded.
fn range_int(
    expr: &Expression,
    label: &str,
    decels: &Declarations,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> InterpResult<i64> {
    match evaluate_expression(expr, decels, runtime, functions)? {
        Value::Integer(value) => Ok(value),
        Value::Float(value) => Err(format!(
            "{} must be a whole number, got {}. Use math::floor to convert.",
            label, value
        )),
        other => Err(format!("{} must be a whole number, got {:?}", label, other)),
    }
}

/// How many times a range yields, without materialising it.
fn range_count(start: i64, end: i64, inclusive: bool, step: i64) -> InterpResult<i64> {
    if step == 0 {
        return Err("range step cannot be 0".to_string());
    }

    // Last value the range is allowed to reach.
    let count = if step > 0 {
        let limit = if inclusive { end } else { end - 1 };
        if start > limit {
            0
        } else {
            (limit - start) / step + 1
        }
    } else {
        let limit = if inclusive { end } else { end + 1 };
        if start < limit {
            0
        } else {
            (start - limit) / -step + 1
        }
    };

    if count > MAX_RANGE_ITERATIONS {
        return Err(format!(
            "range would run {} times; the limit is {}",
            count, MAX_RANGE_ITERATIONS
        ));
    }

    Ok(count)
}

/// Where a `render` block's drawing goes.
///
/// `Copy`, so it threads through the recursive interpreter without the
/// reborrowing a `&mut Scene` would demand at every call. The scene sits behind
/// a `RefCell` for the same reason — the engine is single-threaded and already
/// built this way.
#[derive(Clone, Copy, Default)]
pub struct Target<'a> {
    /// Present in 2d mode.
    pub ctx: Option<&'a CanvasRenderingContext2d>,
    /// Present in 3d mode.
    pub scene: Option<&'a RefCell<Scene>>,
}

impl<'a> Target<'a> {
    pub fn canvas(ctx: &'a CanvasRenderingContext2d) -> Self {
        Target { ctx: Some(ctx), scene: None }
    }

    pub fn scene(scene: &'a RefCell<Scene>) -> Self {
        Target { ctx: None, scene: Some(scene) }
    }

    /// A block that draws nothing, such as `on_frame`.
    pub fn none() -> Self {
        Target::default()
    }
}

pub fn interpret_event_block(block: &Block, decels: &mut Declarations, runtime: &Runtime, functions: &[FunctionDef]) -> InterpResult<()> {
    decels.push_scope();
    let result = (|| {
        for statement in block.statements.iter() {
            interpret_statement(statement, decels, runtime, Target::none(), functions)?;
        }
        Ok(())
    })();
    decels.pop_scope();
    result
}

pub fn interpret_render_block(
    block: &Block,
    decels: &mut Declarations,
    target: Target<'_>,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> InterpResult<()> {
    decels.push_scope();
    let result = (|| {
        for statement in block.statements.iter() {
            interpret_statement(statement, decels, runtime, target, functions)?;
        }
        Ok(())
    })();
    decels.pop_scope();
    result
}

/// Runs a nested block body in its own scope, always popping it again.
///
/// Pushing and popping by hand around a `?` leaks the scope whenever a
/// statement fails, and a leaked scope makes the *next* frame report a bogus
/// "already declared" for the outer block's own `let` — hiding the real
/// mistake behind a confusing one. Going through here keeps the stack
/// balanced on every path out.
fn run_scoped_body(
    body: &[Statement],
    binding: Option<(&str, Value)>,
    decels: &mut Declarations,
    runtime: &Runtime,
    target: Target<'_>,
    functions: &[FunctionDef],
) -> InterpResult<Option<Value>> {
    decels.push_scope();
    if let Some((name, value)) = binding {
        decels.declare(name.to_string(), value);
    }
    let mut result = Ok(None);
    for stmt in body {
        match interpret_statement(stmt, decels, runtime, target, functions) {
            Ok(None) => {}
            other => {
                result = other;
                break;
            }
        }
    }
    decels.pop_scope();
    result
}

fn interpret_statement(
    statement: &Statement,
    decels: &mut Declarations,
    runtime: &Runtime,
    target: Target<'_>,
    functions: &[FunctionDef],
) -> InterpResult<Option<Value>> {
    match statement {
        Statement::LetDecl(let_decl) => {
            if decels.contains(&let_decl.ident) {
                return Err(format!("Variable '{}' already declared", let_decl.ident));
            }
            let evaluated = evaluate_expression(&let_decl.expression, decels, runtime, functions)?;
            decels.declare(let_decl.ident.clone(), evaluated);
            Ok(None)
        }
        Statement::Assignment(assignment) => {
            let evaluated = evaluate_expression(&assignment.expression, decels, runtime, functions)?;
            if !decels.contains(&assignment.ident) {
                return Err(format!("Variable '{}' not declared", assignment.ident));
            }
            decels.set(&assignment.ident, evaluated);
            Ok(None)
        }
        // A user-defined function called for effect. Deliberately not routed
        // through `evaluate_expression`: that path has no canvas to hand, so a
        // `draw::` inside the body would be silently skipped and a drawing
        // helper would do nothing at all. Running it here keeps the context.
        Statement::Call(expression) => {
            let Expression::Call { name, args } = expression else {
                return Err("expected a function call".to_string());
            };

            let func = functions
                .iter()
                .find(|f| f.name == *name)
                .ok_or_else(|| format!("Undefined function: {name}"))?
                .clone();

            let mut func_decels = Declarations::new();
            func_decels.push_scope();

            for param in &func.params {
                // Arguments are evaluated in the *caller's* scope, defaults in
                // the callee's — the usual rule, and the reason defaults can
                // reference nothing but constants here.
                let provided = args.iter().find(|(n, _)| n == &param.name);
                let value = match provided {
                    Some((_, expr)) => evaluate_expression(expr, decels, runtime, functions)?,
                    None => evaluate_expression(&param.default, decels, runtime, functions)?,
                };
                func_decels.declare(param.name.clone(), value);
            }

            for stmt in &func.body {
                if interpret_statement(stmt, &mut func_decels, runtime, target, functions)?.is_some() {
                    // A `return` inside a statement call just ends the call;
                    // there is nowhere for the value to go.
                    break;
                }
            }

            Ok(None)
        }
        Statement::FunctionCall(function_call) => {
            interpret_statement_function_call(function_call, decels, target, runtime, functions)?;
            Ok(None)
        }
        Statement::If(if_stmt) => {
            let condition = evaluate_expression(&if_stmt.condition, decels, runtime, functions)?;
            let is_true = match condition {
                Value::Boolean(b) => b,
                _ => return Err("if condition must evaluate to boolean".to_string()),
            };
            if is_true {
                if let Some(val) =
                    run_scoped_body(&if_stmt.then_body, None, decels, runtime, target, functions)?
                {
                    return Ok(Some(val));
                }
            } else if let Some(else_body) = &if_stmt.else_body {
                if let Some(val) =
                    run_scoped_body(else_body, None, decels, runtime, target, functions)?
                {
                    return Ok(Some(val));
                }
            }
            Ok(None)
        }
        Statement::For(for_loop) => {
            // Ranges are walked numerically rather than expanded into an array,
            // so a large one costs no allocation.
            let (mut current, step, count) = match &for_loop.iterable {
                ForIterable::Range {
                    start,
                    end,
                    inclusive,
                    step,
                } => {
                    let start = range_int(start, "range start", decels, runtime, functions)?;
                    let end = range_int(end, "range end", decels, runtime, functions)?;
                    let step = match step {
                        Some(expr) => range_int(expr, "range step", decels, runtime, functions)?,
                        None => 1,
                    };
                    let count = range_count(start, end, *inclusive, step)?;
                    (start, step, count)
                }
                ForIterable::Expression(expr) => {
                    let iterable = evaluate_expression(expr, decels, runtime, functions)?;
                    let items = match iterable {
                        Value::Array(arr) => arr,
                        // Widened only as it is walked, one value at a time.
                        Value::Bytes(bytes) => {
                            bytes.iter().map(|b| Value::Integer(*b as i64)).collect()
                        }
                        _ => {
                            return Err(
                                "for loop iterable must be an array or a range".to_string()
                            )
                        }
                    };

                    for item in items {
                        if let Some(val) = run_scoped_body(
                            &for_loop.body,
                            Some((&for_loop.variable, item)),
                            decels,
                            runtime,
                            target,
                            functions,
                        )? {
                            return Ok(Some(val));
                        }
                    }
                    return Ok(None);
                }
            };

            for _ in 0..count {
                if let Some(val) = run_scoped_body(
                    &for_loop.body,
                    Some((&for_loop.variable, Value::Integer(current))),
                    decels,
                    runtime,
                    target,
                    functions,
                )? {
                    return Ok(Some(val));
                }
                current += step;
            }
            Ok(None)
        }
        Statement::While(while_loop) => {
            let mut iterations = 0;
            loop {
                let condition = evaluate_expression(&while_loop.condition, decels, runtime, functions)?;
                let is_true = match condition {
                    Value::Boolean(b) => b,
                    _ => return Err("while condition must evaluate to boolean".to_string()),
                };
                if !is_true || iterations > 10000 {
                    break;
                }
                if let Some(val) =
                    run_scoped_body(&while_loop.body, None, decels, runtime, target, functions)?
                {
                    return Ok(Some(val));
                }
                iterations += 1;
            }
            Ok(None)
        }
        Statement::Return(ret) => {
            let val = evaluate_expression(&ret.expression, decels, runtime, functions)?;
            Ok(Some(val))
        }
    }
}

/// Routes a builtin call into the scene under `context 3d`.
///
/// Nothing here touches WebGL: camera, transform and light calls mutate scene
/// state, and `draw::` calls append to the command buffer. The renderer reads
/// that buffer afterwards, which is what lets consecutive draws coalesce.
fn interpret_scene_call(
    call: &FunctionCall,
    decels: &mut Declarations,
    scene: &RefCell<Scene>,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> InterpResult<()> {
    let mut args = ArgReader::new(call, decels, runtime, functions);

    match call.namespace.as_str() {
        "camera" => {
            let mut scene = scene.borrow_mut();
            let camera = &mut scene.camera;

            match call.function.as_str() {
                "perspective" => {
                    let fov = args.angle("fov_deg", "fov_rad")?.unwrap_or(60.0f32.to_radians());
                    camera.projection = Projection::Perspective {
                        fov_rad: fov,
                        near: args.number("near")?.unwrap_or(0.1),
                        far: args.number("far")?.unwrap_or(500.0),
                    };
                }
                "orthographic" => {
                    camera.projection = Projection::Orthographic {
                        height: args.number("height")?.unwrap_or(10.0),
                        near: args.number("near")?.unwrap_or(0.1),
                        far: args.number("far")?.unwrap_or(500.0),
                    };
                }
                "position" => camera.position = args.vec3(0.0, 0.0, 10.0)?,
                "look_at" => camera.aim = Aim::Target(args.vec3(0.0, 0.0, 0.0)?),
                "direction" => camera.aim = Aim::Direction(args.vec3(0.0, 0.0, -1.0)?),
                "up" => camera.up = args.vec3(0.0, 1.0, 0.0)?,
                "orbit" => {
                    let target = [
                        args.number("target_x")?.unwrap_or(0.0),
                        args.number("target_y")?.unwrap_or(0.0),
                        args.number("target_z")?.unwrap_or(0.0),
                    ];
                    let distance = args.number("distance")?.unwrap_or(10.0);
                    let yaw = args.angle("yaw_deg", "yaw_rad")?.unwrap_or(0.0);
                    let pitch = args.angle("pitch_deg", "pitch_rad")?.unwrap_or(0.0);
                    camera.orbit(target, distance, yaw, pitch);
                }
                other => return Err(format!("Unknown camera call: {other}")),
            }
        }

        "transform" => {
            let matrix = match call.function.as_str() {
                "push" => return scene.borrow_mut().push(),
                "pop" => return scene.borrow_mut().pop(),
                "identity" => {
                    scene.borrow_mut().identity();
                    return Ok(());
                }
                "translate" => {
                    let v = args.vec3(0.0, 0.0, 0.0)?;
                    Mat4::translation(v[0], v[1], v[2])
                }
                "rotate_x" => Mat4::rotation_x(args.angle("deg", "rad")?.unwrap_or(0.0)),
                "rotate_y" => Mat4::rotation_y(args.angle("deg", "rad")?.unwrap_or(0.0)),
                "rotate_z" => Mat4::rotation_z(args.angle("deg", "rad")?.unwrap_or(0.0)),
                "scale" => {
                    // `all` is uniform shorthand and wins over the axes.
                    match args.number("all")? {
                        Some(all) => Mat4::scaling(all, all, all),
                        None => {
                            let v = args.vec3(1.0, 1.0, 1.0)?;
                            Mat4::scaling(v[0], v[1], v[2])
                        }
                    }
                }
                other => return Err(format!("Unknown transform call: {other}")),
            };

            scene.borrow_mut().apply(matrix);
        }

        "light" => {
            let color = args.color("color")?.unwrap_or(WHITE);
            let intensity = args.number("intensity")?.unwrap_or(1.0);
            let mut scene = scene.borrow_mut();

            match call.function.as_str() {
                "ambient" => scene.lights.ambient = Some(args.color("color")?.unwrap_or(BLACK)),
                "directional" => scene.add_directional(DirectionalLight {
                    direction: args.vec3(0.0, -1.0, 0.0)?,
                    color,
                    intensity,
                }),
                "point" => scene.add_point(PointLight {
                    position: args.vec3(0.0, 0.0, 0.0)?,
                    color,
                    intensity,
                    range: args.number("range")?.unwrap_or(50.0),
                }),
                other => return Err(format!("Unknown light call: {other}")),
            }
        }

        "gfx" => {
            let mut scene = scene.borrow_mut();
            match call.function.as_str() {
                "depth" => {
                    scene.gfx.depth_enabled = args.boolean("enabled")?.unwrap_or(true);
                    scene.gfx.depth_write = args.boolean("write")?.unwrap_or(true);
                }
                "blend" => {
                    scene.gfx.blend = match args.text("mode")?.as_deref() {
                        Some("additive") => BlendMode::Additive,
                        Some("multiply") => BlendMode::Multiply,
                        Some("none") => BlendMode::None,
                        _ => BlendMode::Alpha,
                    }
                }
                "cull" => {
                    scene.gfx.cull = match args.text("mode")?.as_deref() {
                        Some("back") => CullMode::Back,
                        Some("front") => CullMode::Front,
                        _ => CullMode::None,
                    }
                }
                "clear" => scene.gfx.clear = Some(args.color("color")?.unwrap_or(BLACK)),
                "overlay" => scene.gfx.overlay = args.boolean("enabled")?.unwrap_or(false),
                other => return Err(format!("Unknown gfx call: {other}")),
            }
        }

        "draw" => return record_draw(call, &mut args, scene),

        other => return Err(format!("Unknown namespace in 3d mode: {other}")),
    }

    Ok(())
}

/// Appends one `draw::` call to the command buffer.
fn record_draw(
    call: &FunctionCall,
    args: &mut ArgReader<'_>,
    scene: &RefCell<Scene>,
) -> InterpResult<()> {
    let primitive = match call.function.as_str() {
        "cube" => Primitive::Cube,
        "sphere" => Primitive::Sphere {
            resolution: args.count("resolution", 24)?,
        },
        "plane" => Primitive::Plane {
            subdivisions: args.count("subdivisions", 1)?,
        },
        "cylinder" => Primitive::Cylinder {
            segments: args.count("segments", 32)?,
        },
        "cone" => Primitive::Cone {
            segments: args.count("segments", 32)?,
        },
        "torus" => {
            let radius = args.number("radius")?.unwrap_or(0.5).abs().max(1e-3);
            let tube = args.number("tube")?.unwrap_or(0.15).abs();
            Primitive::Torus {
                segments: args.count("segments", 32)?,
                tube_segments: args.count("tube_segments", 16)?,
                tube_ratio: ((tube / radius) * 1000.0).round().clamp(1.0, 4000.0) as u32,
            }
        }
        "sprite" => Primitive::Sprite,
        "mesh" => {
            let mesh = args.mesh()?;
            let id = scene.borrow_mut().add_mesh(mesh)?;
            Primitive::Mesh { id }
        }
        // The 2D primitives are promoted to world space. Recording them is the
        // renderer's remaining work; the resolver already accepts them here.
        other => return Err(format!("draw::{other} is not rendered in 3d mode yet")),
    };

    // Size, then the primitive's own rotation, then its position — all inside
    // whatever the transform stack is currently in.
    let size = match call.function.as_str() {
        "cube" => match args.number("size")? {
            Some(s) => [s, s, s],
            None => [
                args.number("w")?.unwrap_or(1.0),
                args.number("h")?.unwrap_or(1.0),
                args.number("d")?.unwrap_or(1.0),
            ],
        },
        "sphere" => {
            let r = args.number("radius")?.unwrap_or(0.5) * 2.0;
            [r, r, r]
        }
        "plane" => [
            args.number("w")?.unwrap_or(1.0),
            1.0,
            args.number("d")?.unwrap_or(1.0),
        ],
        "cylinder" | "cone" => {
            let d = args.number("radius")?.unwrap_or(0.5) * 2.0;
            [d, args.number("height")?.unwrap_or(1.0), d]
        }
        "torus" => {
            let r = args.number("radius")?.unwrap_or(0.5) * 2.0;
            [r, r, r]
        }
        "sprite" => match args.number("size")? {
            Some(s) => [s, s, 1.0],
            None => [
                args.number("w")?.unwrap_or(1.0),
                args.number("h")?.unwrap_or(1.0),
                1.0,
            ],
        },
        _ => [1.0, 1.0, 1.0],
    };

    let position = args.vec3(0.0, 0.0, 0.0)?;
    let rotation = Mat4::rotation_z(args.angle("rot_z", "rot_z_rad")?.unwrap_or(0.0))
        .mul(&Mat4::rotation_y(args.angle("rot_y", "rot_y_rad")?.unwrap_or(0.0)))
        .mul(&Mat4::rotation_x(args.angle("rot_x", "rot_x_rad")?.unwrap_or(0.0)));

    let local = Mat4::translation(position[0], position[1], position[2])
        .mul(&rotation)
        .mul(&Mat4::scaling(size[0], size[1], size[2]));

    let color = args.color("color")?.unwrap_or(WHITE);
    let opacity = args.number("opacity")?.unwrap_or(1.0).clamp(0.0, 1.0);
    let wireframe = args.boolean("wireframe")?.unwrap_or(false);

    let mut scene = scene.borrow_mut();
    let shading = match args.text("shading")?.as_deref() {
        Some("unlit") => Shading::Unlit,
        Some("flat") => Shading::Flat,
        Some("lambert") => Shading::Lambert,
        // §6.6 — decided at draw time, which is why lights must come first.
        _ => scene.default_shading(),
    };

    let model = scene.top().mul(&local);
    let key = BatchKey {
        primitive,
        shading,
        wireframe,
        blend: scene.gfx.blend,
        cull: scene.gfx.cull,
        depth_enabled: scene.gfx.depth_enabled,
        depth_write: scene.gfx.depth_write,
        overlay: scene.gfx.overlay,
    };

    scene.record(DrawCommand { key, model, color, opacity });
    Ok(())
}

/// Reads named arguments, evaluating each at most once.
struct ArgReader<'a> {
    call: &'a FunctionCall,
    decels: &'a mut Declarations,
    runtime: &'a Runtime,
    functions: &'a [FunctionDef],
}

impl<'a> ArgReader<'a> {
    fn new(
        call: &'a FunctionCall,
        decels: &'a mut Declarations,
        runtime: &'a Runtime,
        functions: &'a [FunctionDef],
    ) -> Self {
        ArgReader { call, decels, runtime, functions }
    }

    fn raw(&mut self, name: &str) -> InterpResult<Option<Value>> {
        let Some(arg) = self.call.args.iter().find(|a| a.name == name) else {
            return Ok(None);
        };
        evaluate_expression(&arg.expression, self.decels, self.runtime, self.functions).map(Some)
    }

    fn number(&mut self, name: &str) -> InterpResult<Option<f32>> {
        match self.raw(name)? {
            Some(value) => Ok(Some(value.try_into_f64()? as f32)),
            None => Ok(None),
        }
    }

    /// A whole-number argument such as a segment count.
    fn count(&mut self, name: &str, default: u32) -> InterpResult<u32> {
        match self.number(name)? {
            // Clamped rather than rejected: a resolution driven by audio can
            // dip below what a mesh needs, and failing the frame for it would
            // be worse than quietly using the minimum.
            Some(n) if n.is_finite() => Ok((n.round().clamp(1.0, 512.0)) as u32),
            _ => Ok(default),
        }
    }

    fn boolean(&mut self, name: &str) -> InterpResult<Option<bool>> {
        match self.raw(name)? {
            Some(Value::Boolean(b)) => Ok(Some(b)),
            Some(other) => Err(format!(
                "{}::{}: '{name}' needs a boolean, got {}",
                self.call.namespace,
                self.call.function,
                other.type_tag()
            )),
            None => Ok(None),
        }
    }

    fn text(&mut self, name: &str) -> InterpResult<Option<String>> {
        match self.raw(name)? {
            Some(Value::String(s)) => Ok(Some(s)),
            Some(other) => Err(format!(
                "{}::{}: '{name}' needs a string, got {}",
                self.call.namespace,
                self.call.function,
                other.type_tag()
            )),
            None => Ok(None),
        }
    }

    fn color(&mut self, name: &str) -> InterpResult<Option<Color>> {
        match self.raw(name)? {
            Some(value) => Ok(Some(value.try_into_color()?)),
            None => Ok(None),
        }
    }

    fn vec3(&mut self, dx: f32, dy: f32, dz: f32) -> InterpResult<[f32; 3]> {
        Ok([
            self.number("x")?.unwrap_or(dx),
            self.number("y")?.unwrap_or(dy),
            self.number("z")?.unwrap_or(dz),
        ])
    }

    /// An angle in whichever unit was given, returned in radians.
    ///
    /// The resolver has already rejected both being supplied at once, so this
    /// only has to prefer one.
    fn angle(&mut self, deg: &str, rad: &str) -> InterpResult<Option<f32>> {
        if let Some(d) = self.number(deg)? {
            return Ok(Some(d.to_radians()));
        }
        self.number(rad)
    }

    fn mesh(&mut self) -> InterpResult<MeshData> {
        let vertices = self.points("vertices")?;
        let normals = self.points("normals")?;
        let uvs = self
            .points("uvs")?
            .into_iter()
            .map(|p| [p[0], p[1]])
            .collect();

        let indices = match self.raw("indices")? {
            Some(Value::Array(items)) => items
                .into_iter()
                .map(|v| v.try_into_f64().map(|n| n.max(0.0) as u32))
                .collect::<Result<Vec<_>, _>>()?,
            _ => Vec::new(),
        };

        Ok(MeshData { vertices, indices, normals, uvs })
    }

    fn points(&mut self, name: &str) -> InterpResult<Vec<[f32; 3]>> {
        let Some(Value::Array(rows)) = self.raw(name)? else {
            return Ok(Vec::new());
        };

        rows.into_iter()
            .map(|row| match row {
                Value::Array(parts) => {
                    let mut out = [0.0f32; 3];
                    for (i, part) in parts.into_iter().take(3).enumerate() {
                        out[i] = part.try_into_f64()? as f32;
                    }
                    Ok(out)
                }
                other => Err(format!(
                    "draw::mesh: '{name}' needs arrays of numbers, got {}",
                    other.type_tag()
                )),
            })
            .collect()
    }
}

#[allow(deprecated)]
fn interpret_statement_function_call(
    function_call: &FunctionCall,
    decels: &mut Declarations,
    target: Target<'_>,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> InterpResult<()> {
    // 3d mode records into the scene instead of painting a canvas. The
    // resolver has already rejected these namespaces under `context 2d`, so
    // reaching here means the script asked for 3d.
    if let Some(scene) = target.scene {
        return interpret_scene_call(function_call, decels, scene, runtime, functions);
    }

    // Nothing to draw on — an `on_frame` block, where draw calls are skipped.
    let Some(ctx) = target.ctx else {
        return Ok(());
    };

    match function_call.namespace.as_str() {
        "draw" => match function_call.function.as_str() {
            "clear" => {
                ctx.clear_rect(0.0, 0.0, runtime.canvas_width, runtime.canvas_height);
            }
            "background" => {
                let mut color = BLACK;
                for arg in function_call.args.iter() {
                    if arg.name == "color" {
                        let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                        color = evaluated.try_into_color()?;
                    }
                }
                set_fill(ctx, color);
                ctx.fill_rect(0.0, 0.0, runtime.canvas_width, runtime.canvas_height);
            }
            "polygon" => {
                let mut points = Vec::new();
                let mut color = WHITE;
                let mut rotate: f64 = 0.0;

                for arg in function_call.args.iter() {
                    let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                    match arg.name.as_str() {
                        "points" => points = points_from_value(evaluated),
                        "color" => color = evaluated.try_into_color()?,
                        "rotate" => rotate = evaluated.try_into_f64()?,
                        _ => {}
                    }
                }

                if !points.is_empty() {
                    let cx = points.iter().map(|p| p.x).sum::<f64>() / points.len() as f64;
                    let cy = points.iter().map(|p| p.y).sum::<f64>() / points.len() as f64;

                    ctx.save();
                    let _ = ctx.translate(cx, cy);
                    let _ = ctx.rotate(rotate);
                    let _ = ctx.translate(-cx, -cy);

                    ctx.begin_path();
                    if let Some(first) = points.first() {
                        ctx.move_to(first.x, first.y);
                    }
                    for point in points.iter().skip(1) {
                        ctx.line_to(point.x, point.y);
                    }
                    ctx.close_path();

                    set_fill(ctx, color);
                    ctx.fill();
                    ctx.restore();
                }
            }
            "circle" => {
                let mut x = 0.0;
                let mut y = 0.0;
                let mut radius = 50.0;
                let mut color = WHITE;
                let mut stroke = false;
                let mut stroke_weight = 1.0;
                let mut stroke_color = BLACK;

                for arg in function_call.args.iter() {
                    let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                    match arg.name.as_str() {
                        "x" => x = evaluated.try_into_f64()?,
                        "y" => y = evaluated.try_into_f64()?,
                        "radius" => radius = evaluated.try_into_f64()?,
                        "color" => color = evaluated.try_into_color()?,
                        "stroke" => stroke = matches!(evaluated, Value::Boolean(true)),
                        "stroke_weight" => stroke_weight = evaluated.try_into_f64()?,
                        "stroke_color" => stroke_color = evaluated.try_into_color()?,
                        _ => {}
                    }
                }

                ctx.begin_path();
                let _ = ctx.arc(x, y, radius, 0.0, std::f64::consts::PI * 2.0);
                ctx.close_path();

                if stroke {
                    set_stroke(ctx, stroke_color);
                    ctx.set_line_width(stroke_weight);
                    ctx.stroke();
                } else {
                    set_fill(ctx, color);
                    ctx.fill();
                }
            }
            "rect" => {
                let mut x = 0.0;
                let mut y = 0.0;
                let mut w = 100.0;
                let mut h = 100.0;
                let mut color = WHITE;
                let mut stroke = false;
                let mut stroke_weight = 1.0;
                let mut stroke_color = BLACK;
                let mut rotate: f64 = 0.0;

                for arg in function_call.args.iter() {
                    let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                    match arg.name.as_str() {
                        "x" => x = evaluated.try_into_f64()?,
                        "y" => y = evaluated.try_into_f64()?,
                        "width" | "w" => w = evaluated.try_into_f64()?,
                        "height" | "h" => h = evaluated.try_into_f64()?,
                        "color" => color = evaluated.try_into_color()?,
                        "stroke" => stroke = matches!(evaluated, Value::Boolean(true)),
                        "stroke_weight" => stroke_weight = evaluated.try_into_f64()?,
                        "stroke_color" => stroke_color = evaluated.try_into_color()?,
                        "rotate" => rotate = evaluated.try_into_f64()?,
                        _ => {}
                    }
                }

                ctx.save();
                let cx = x + w / 2.0;
                let cy = y + h / 2.0;
                let _ = ctx.translate(cx, cy);
                let _ = ctx.rotate(rotate);
                let _ = ctx.translate(-cx, -cy);

                if stroke {
                    set_stroke(ctx, stroke_color);
                    ctx.set_line_width(stroke_weight);
                    ctx.stroke_rect(x, y, w, h);
                } else {
                    set_fill(ctx, color);
                    ctx.fill_rect(x, y, w, h);
                }
                ctx.restore();
            }
            "line" => {
                let mut x1 = 0.0;
                let mut y1 = 0.0;
                let mut x2 = 100.0;
                let mut y2 = 100.0;
                let mut color = WHITE;
                let mut stroke_weight = 1.0;

                for arg in function_call.args.iter() {
                    let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                    match arg.name.as_str() {
                        "x1" => x1 = evaluated.try_into_f64()?,
                        "y1" => y1 = evaluated.try_into_f64()?,
                        "x2" => x2 = evaluated.try_into_f64()?,
                        "y2" => y2 = evaluated.try_into_f64()?,
                        "color" => color = evaluated.try_into_color()?,
                        "stroke_weight" => stroke_weight = evaluated.try_into_f64()?,
                        _ => {}
                    }
                }

                ctx.begin_path();
                ctx.move_to(x1, y1);
                ctx.line_to(x2, y2);
                set_stroke(ctx, color);
                ctx.set_line_width(stroke_weight);
                ctx.stroke();
            }
            "ellipse" => {
                let mut x = 0.0;
                let mut y = 0.0;
                let mut rx = 50.0;
                let mut ry = 30.0;
                let mut color = WHITE;
                let mut stroke = false;
                let mut stroke_weight = 1.0;
                let mut stroke_color = BLACK;
                let mut rotate: f64 = 0.0;

                for arg in function_call.args.iter() {
                    let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                    match arg.name.as_str() {
                        "x" => x = evaluated.try_into_f64()?,
                        "y" => y = evaluated.try_into_f64()?,
                        "rx" | "radius_x" => rx = evaluated.try_into_f64()?,
                        "ry" | "radius_y" => ry = evaluated.try_into_f64()?,
                        "color" => color = evaluated.try_into_color()?,
                        "stroke" => stroke = matches!(evaluated, Value::Boolean(true)),
                        "stroke_weight" => stroke_weight = evaluated.try_into_f64()?,
                        "stroke_color" => stroke_color = evaluated.try_into_color()?,
                        "rotate" => rotate = evaluated.try_into_f64()?,
                        _ => {}
                    }
                }

                ctx.save();
                let _ = ctx.translate(x, y);
                let _ = ctx.rotate(rotate);

                ctx.begin_path();
                let _ = ctx.ellipse(0.0, 0.0, rx, ry, 0.0, 0.0, std::f64::consts::PI * 2.0);
                ctx.close_path();

                if stroke {
                    set_stroke(ctx, stroke_color);
                    ctx.set_line_width(stroke_weight);
                    ctx.stroke();
                } else {
                    set_fill(ctx, color);
                    ctx.fill();
                }
                ctx.restore();
            }
            "text" => {
                let mut content = String::new();
                let mut x = 0.0;
                let mut y = 0.0;
                let mut size = 16.0;
                let mut color = WHITE;
                let mut font = "monospace".to_string();

                for arg in function_call.args.iter() {
                    let evaluated = evaluate_expression(&arg.expression, decels, runtime, functions)?;
                    match arg.name.as_str() {
                        "content" | "text" => {
                            content = match evaluated {
                                Value::String(s) => s,
                                other => format!("{:?}", other),
                            };
                        }
                        "x" => x = evaluated.try_into_f64()?,
                        "y" => y = evaluated.try_into_f64()?,
                        "size" => size = evaluated.try_into_f64()?,
                        "color" => color = evaluated.try_into_color()?,
                        "font" => {
                            if let Value::String(f) = evaluated { font = f; }
                        }
                        _ => {}
                    }
                }

                set_fill(ctx, color);
                ctx.set_font(&format!("{}px {}", size, font));
                let _ = ctx.fill_text(&content, x, y);
            }
            other => {
                web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str(&format!("Unknown draw function: {}", other)));
            }
        },
        other => {
            web_sys::console::warn_1(&wasm_bindgen::JsValue::from_str(&format!("Unknown namespace: {}", other)));
        }
    }
    Ok(())
}

pub fn evaluate_expression(expr: &Expression, decels: &Declarations, runtime: &Runtime, functions: &[FunctionDef]) -> InterpResult<Value> {
    match expr {
        Expression::Literal(lit) => Ok(match lit {
            Literal::Boolean(b) => Value::Boolean(*b),
            Literal::Integer(i) => Value::Integer(*i),
            Literal::Float(f) => Value::Float(*f),
            Literal::String(s) => Value::String(s.clone()),
        }),

        Expression::Identifier(name) => decels
            .get(name)
            .cloned()
            .ok_or_else(|| format!("Undefined identifier: {}", name)),

        Expression::SystemValue(name) => map_value_runtime(name, runtime),

        Expression::Array(elements) => {
            let mut vals = Vec::new();
            for e in elements.iter() {
                vals.push(evaluate_expression(e, decels, runtime, functions)?);
            }
            Ok(Value::Array(vals))
        }

        Expression::Grouping(inner) => evaluate_expression(inner, decels, runtime, functions),
        Expression::Index { target, index } => {
            let collection = evaluate_expression(target, decels, runtime, functions)?;
            // Bytes are read in place; nothing is materialised to index them.
            let items = match collection {
                Value::Array(items) => items,
                Value::Bytes(bytes) => {
                    let position = match evaluate_expression(index, decels, runtime, functions)? {
                        Value::Integer(i) => i,
                        Value::Float(f) => {
                            return Err(format!(
                                "array index must be a whole number, got {}. Use \\ or math::floor.",
                                f
                            ))
                        }
                        other => {
                            return Err(format!(
                                "array index must be a whole number, got {}",
                                type_name(&other)
                            ))
                        }
                    };

                    // Out of range reads as 0, the same as any other array:
                    // the audio buffers are empty whenever nothing is playing.
                    let value = usize::try_from(position)
                        .ok()
                        .and_then(|i| bytes.get(i).copied())
                        .unwrap_or(0);

                    return Ok(Value::Integer(value as i64));
                }
                other => {
                    return Err(format!(
                        "cannot index into {}; only arrays can be indexed",
                        type_name(&other)
                    ))
                }
            };

            let position = match evaluate_expression(index, decels, runtime, functions)? {
                Value::Integer(i) => i,
                Value::Float(f) => {
                    return Err(format!(
                        "array index must be a whole number, got {}. Use \\ or math::floor.",
                        f
                    ))
                }
                other => {
                    return Err(format!(
                        "array index must be a whole number, got {}",
                        type_name(&other)
                    ))
                }
            };

            // Out of range reads as 0 rather than failing. $FREQUENCY_DATA and
            // $TIME_DOMAIN_DATA are empty whenever no audio is playing, so an
            // error here would break every audio-reactive script the moment it
            // fell silent (E4.7 — everything must run without audio).
            if position < 0 {
                return Ok(Value::Integer(0));
            }
            Ok(items
                .get(position as usize)
                .cloned()
                .unwrap_or(Value::Integer(0)))
        }

        Expression::Unary { op, expr: inner } => {
            let v = evaluate_expression(inner, decels, runtime, functions)?;
            match op {
                UnaryOperator::Not => match v {
                    Value::Boolean(b) => Ok(Value::Boolean(!b)),
                    _ => Err("Type error: expected boolean for '!'".to_string()),
                },
                UnaryOperator::Negate => match v {
                    Value::Integer(i) => Ok(Value::Integer(-i)),
                    Value::Float(f) => Ok(Value::Float(-f)),
                    _ => Err("Type error: expected number for unary '-'".to_string()),
                },
                UnaryOperator::Plus => Ok(v),
            }
        }

        Expression::Binary { left, op, right } => {
            // Short-circuit before touching the right side. This is what makes
            // `n > 0 && total / n > 5` safe, and a guard that still evaluated
            // what it was guarding would be no guard at all.
            if matches!(op, BinaryOperator::And | BinaryOperator::Or) {
                let l = evaluate_expression(left, decels, runtime, functions)?;
                let Value::Boolean(a) = l else {
                    return Err(format!(
                        "Type error: '{}' needs a boolean, got {}",
                        if matches!(op, BinaryOperator::And) { "&&" } else { "||" },
                        l.type_tag()
                    ));
                };

                // `false && _` is false and `true || _` is true whatever
                // follows, so the right side is never looked at.
                if (matches!(op, BinaryOperator::And) && !a)
                    || (matches!(op, BinaryOperator::Or) && a)
                {
                    return Ok(Value::Boolean(a));
                }

                let r = evaluate_expression(right, decels, runtime, functions)?;
                let Value::Boolean(b) = r else {
                    return Err(format!(
                        "Type error: '{}' needs a boolean, got {}",
                        if matches!(op, BinaryOperator::And) { "&&" } else { "||" },
                        r.type_tag()
                    ));
                };
                return Ok(Value::Boolean(b));
            }

            let l = evaluate_expression(left, decels, runtime, functions)?;
            let r = evaluate_expression(right, decels, runtime, functions)?;
            match op {
                // Whole numbers only: a bit pattern is not a meaningful notion
                // for a float, and silently truncating one would hide the
                // mistake rather than report it.
                BinaryOperator::BitAnd | BinaryOperator::BitOr | BinaryOperator::BitXor => {
                    let (Value::Integer(a), Value::Integer(b)) = (&l, &r) else {
                        let symbol = match op {
                            BinaryOperator::BitAnd => "&",
                            BinaryOperator::BitOr => "|",
                            _ => "^",
                        };
                        return Err(format!(
                            "Type error: '{}' needs whole numbers, got {} and {}",
                            symbol,
                            l.type_tag(),
                            r.type_tag()
                        ));
                    };
                    Ok(Value::Integer(match op {
                        BinaryOperator::BitAnd => a & b,
                        BinaryOperator::BitOr => a | b,
                        _ => a ^ b,
                    }))
                }
                BinaryOperator::And | BinaryOperator::Or => {
                    unreachable!("handled above, before the right side is evaluated")
                }
                BinaryOperator::Add => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) => Ok(Value::Integer(a + b)),
                    (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a + b)),
                    (Value::Integer(a), Value::Float(b)) => Ok(Value::Float(a as f64 + b)),
                    (Value::Float(a), Value::Integer(b)) => Ok(Value::Float(a + b as f64)),
                    (Value::String(a), Value::String(b)) => Ok(Value::String(a + &b)),
                    _ => Err("Type error: '+' on incompatible types".to_string()),
                },
                BinaryOperator::Subtract => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) => Ok(Value::Integer(a - b)),
                    (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a - b)),
                    (Value::Integer(a), Value::Float(b)) => Ok(Value::Float(a as f64 - b)),
                    (Value::Float(a), Value::Integer(b)) => Ok(Value::Float(a - b as f64)),
                    _ => Err("Type error: '-' on incompatible types".to_string()),
                },
                BinaryOperator::Multiply => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) => Ok(Value::Integer(a * b)),
                    (Value::Float(a), Value::Float(b)) => Ok(Value::Float(a * b)),
                    (Value::Integer(a), Value::Float(b)) => Ok(Value::Float(a as f64 * b)),
                    (Value::Float(a), Value::Integer(b)) => Ok(Value::Float(a * b as f64)),
                    _ => Err("Type error: '*' on incompatible types".to_string()),
                },
                // `/` always produces a float, even for two integers.
                //
                // Truncating integer division is a trap in a language like this:
                // $TIME_MS, $FRAME_COUNT and every value in $FREQUENCY_DATA are
                // integers, so `$TIME_MS / 5000` would step 0, 1, 2… and
                // `v / 255` would only ever be 0 or 1 — silently, with no type
                // error to point at. Use math::floor for deliberate truncation.
                BinaryOperator::Divide => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) if b != 0 => {
                        Ok(Value::Float(a as f64 / b as f64))
                    }
                    (Value::Float(a), Value::Float(b)) if b != 0.0 => Ok(Value::Float(a / b)),
                    (Value::Integer(a), Value::Float(b)) if b != 0.0 => Ok(Value::Float(a as f64 / b)),
                    (Value::Float(a), Value::Integer(b)) if b != 0 => Ok(Value::Float(a / b as f64)),
                    _ => Err("Division by zero or type error for '/'".to_string()),
                },
                // `\` — integer division. Accepts floats and truncates toward
                // zero, because most of what you divide is a float ($WIDTH and
                // friends) and rejecting those would make the operator useless
                // for the grid maths it exists for. Use math::floor for floor
                // semantics on negatives.
                BinaryOperator::IntegerDivide => {
                    let divisor = match &r {
                        Value::Integer(b) => *b as f64,
                        Value::Float(b) => *b,
                        _ => return Err("Type error: '\\' needs numbers".to_string()),
                    };
                    let dividend = match &l {
                        Value::Integer(a) => *a as f64,
                        Value::Float(a) => *a,
                        _ => return Err("Type error: '\\' needs numbers".to_string()),
                    };

                    if divisor == 0.0 {
                        return Err("Division by zero for '\\'".to_string());
                    }
                    Ok(Value::Integer((dividend / divisor).trunc() as i64))
                }
                BinaryOperator::Modulus => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) if b != 0 => Ok(Value::Integer(a % b)),
                    (Value::Float(a), Value::Float(b)) if b != 0.0 => Ok(Value::Float(a.rem_euclid(b))),
                    (Value::Integer(a), Value::Float(b)) if b != 0.0 => Ok(Value::Float((a as f64).rem_euclid(b))),
                    (Value::Float(a), Value::Integer(b)) if b != 0 => Ok(Value::Float(a.rem_euclid(b as f64))),
                    _ => Err("Type error or division by zero for '%'".to_string()),
                },
                BinaryOperator::Equal | BinaryOperator::NotEqual => {
                    let eq = match (&l, &r) {
                        (Value::Boolean(a), Value::Boolean(b)) => a == b,
                        (Value::Integer(a), Value::Integer(b)) => a == b,
                        (Value::Float(a), Value::Float(b)) => a == b,
                        (Value::Integer(a), Value::Float(b)) => (*a as f64) == *b,
                        (Value::Float(a), Value::Integer(b)) => *a == (*b as f64),
                        (Value::String(a), Value::String(b)) => a == b,
                        (Value::Array(a), Value::Array(b)) => a == b,
                        _ => false,
                    };
                    let result = if *op == BinaryOperator::Equal { eq } else { !eq };
                    Ok(Value::Boolean(result))
                }
                BinaryOperator::LessThan
                | BinaryOperator::LessThanOrEqual
                | BinaryOperator::GreaterThan
                | BinaryOperator::GreaterThanOrEqual => {
                    let (fa, fb) = match (l, r) {
                        (Value::Integer(a), Value::Integer(b)) => (a as f64, b as f64),
                        (Value::Float(a), Value::Float(b)) => (a, b),
                        (Value::Integer(a), Value::Float(b)) => (a as f64, b),
                        (Value::Float(a), Value::Integer(b)) => (a, b as f64),
                        _ => return Err("Type error for relational operator".to_string()),
                    };
                    let cmp = match op {
                        BinaryOperator::LessThan => fa < fb,
                        BinaryOperator::LessThanOrEqual => fa <= fb,
                        BinaryOperator::GreaterThan => fa > fb,
                        BinaryOperator::GreaterThanOrEqual => fa >= fb,
                        _ => unreachable!(),
                    };
                    Ok(Value::Boolean(cmp))
                }
            }
        }

        Expression::MathCall { func, args } => {
            let get_arg = |name: &str| -> InterpResult<f64> {
                for (n, expr) in args.iter() {
                    if n == name {
                        let val = evaluate_expression(expr, decels, runtime, functions)?;
                        return Ok(val.try_into_f64()?);
                    }
                }
                Err(format!("Missing argument '{}' for math::{}", name, func))
            };

            let result = match func.as_str() {
                // Trigonometric
                "sin" => get_arg("radians")?.sin(),
                "cos" => get_arg("radians")?.cos(),
                "tan" => get_arg("radians")?.tan(),
                "asin" => get_arg("value")?.asin(),
                "acos" => get_arg("value")?.acos(),
                "atan" => get_arg("value")?.atan(),
                "atan2" => {
                    let y = get_arg("y")?;
                    let x = get_arg("x")?;
                    y.atan2(x)
                }
                // Powers and roots
                "sqrt" => get_arg("value")?.sqrt(),
                "cbrt" => get_arg("value")?.cbrt(),
                "pow" => {
                    let base = get_arg("base")?;
                    let exp = get_arg("exp")?;
                    base.powf(exp)
                }
                "exp" => get_arg("value")?.exp(),
                "ln" => get_arg("value")?.ln(),
                "log2" => get_arg("value")?.log2(),
                "log10" => get_arg("value")?.log10(),
                // Rounding
                "abs" => get_arg("value")?.abs(),
                "floor" => get_arg("value")?.floor(),
                "ceil" => get_arg("value")?.ceil(),
                "round" => get_arg("value")?.round(),
                "trunc" => get_arg("value")?.trunc(),
                // Min/max/clamp
                "min" => {
                    let a = get_arg("a")?;
                    let b = get_arg("b")?;
                    a.min(b)
                }
                "max" => {
                    let a = get_arg("a")?;
                    let b = get_arg("b")?;
                    a.max(b)
                }
                "clamp" => {
                    let value = get_arg("value")?;
                    let min = get_arg("min")?;
                    let max = get_arg("max")?;
                    value.clamp(min, max)
                }
                _ => return Err(format!("Unknown math function: {}", func)),
            };
            Ok(Value::Float(result))
        }

        Expression::Call { name, args } => {
            let func = functions
                .iter()
                .find(|f| f.name == *name)
                .ok_or_else(|| format!("Undefined function: {}", name))?;

            let mut func_decels = Declarations::new();
            func_decels.push_scope();

            for param in &func.params {
                // Look for a provided arg with this name
                let provided = args.iter().find(|(n, _)| n == &param.name);
                let val = if let Some((_, expr)) = provided {
                    evaluate_expression(expr, decels, runtime, functions)?
                } else {
                    // Use the default value
                    evaluate_expression(&param.default, decels, runtime, functions)?
                };
                func_decels.declare(param.name.clone(), val);
            }

            let mut result = Value::Boolean(false);
            for stmt in &func.body {
                if let Some(val) = interpret_statement(stmt, &mut func_decels, runtime, Target::none(), functions)? {
                    result = val;
                    break;
                }
            }
            Ok(result)
        }

        Expression::ColorConstruct { kind, args } => {
            // An argument that is simply absent falls back to 0.0 — omitting
            // `blue` is a legitimate way to ask for none of it. An argument
            // that is *present but fails to evaluate* is a mistake in the
            // script, so it is reported rather than quietly read as 0.0.
            let get_arg = |name: &str| -> InterpResult<f64> {
                for (n, expr) in args.iter() {
                    if n == name {
                        return Ok(evaluate_expression(expr, decels, runtime, functions)?.try_into_f64()?);
                    }
                }
                Ok(0.0)
            };

            match kind {
                ColorConstructKind::Rgb => {
                    let r = get_arg("r")?.clamp(0.0, 1.0);
                    let g = get_arg("g")?.clamp(0.0, 1.0);
                    let b = get_arg("b")?.clamp(0.0, 1.0);
                    let a = if args.iter().any(|(n, _)| n == "transparent") {
                        1.0 - get_arg("transparent")?.clamp(0.0, 1.0)
                    } else {
                        1.0
                    };
                    Ok(Value::Color(Color::new(r, g, b, a)))
                }
                ColorConstructKind::Hsl => {
                    let h = get_arg("h")?;
                    let s = get_arg("s")?.clamp(0.0, 1.0);
                    let l = get_arg("l")?.clamp(0.0, 1.0);
                    let a = if args.iter().any(|(n, _)| n == "transparent") {
                        1.0 - get_arg("transparent")?.clamp(0.0, 1.0)
                    } else {
                        1.0
                    };
                    // HSL to RGB conversion
                    let (r, g, b) = hsl_to_rgb(h, s, l);
                    Ok(Value::Color(Color::new(r, g, b, a)))
                }
            }
        }
    }
}

pub(crate) fn map_value_runtime(name: &str, runtime: &Runtime) -> InterpResult<Value> {
    match name {
        "TIME_SEC" => Ok(Value::Float(start_time_ms() as f64 / 1000.0)),
        "TIME_MS" => Ok(Value::Integer(start_time_ms() as i64)),
        "WIDTH" => Ok(Value::Float(runtime.canvas_width)),
        "HEIGHT" => Ok(Value::Float(runtime.canvas_height)),
        "MOUSE_X" => Ok(Value::Float(runtime.mouse_x)),
        "MOUSE_Y" => Ok(Value::Float(runtime.mouse_y)),
        "FRAME_COUNT" => Ok(Value::Integer(runtime.frame_count as i64)),
        // Audio. Each is 0..255; time domain is centred on 128 (silence).
        "TIME_DOMAIN_DATA" => Ok(byte_array_value(&runtime.time_domain)),
        "FREQUENCY_DATA" => Ok(byte_array_value(&runtime.frequency)),
        "BEAT" => Ok(Value::Boolean(runtime.beat)),
        // Math constants
        "PI" => Ok(Value::Float(std::f64::consts::PI)),
        "E" => Ok(Value::Float(std::f64::consts::E)),
        "TAU" => Ok(Value::Float(std::f64::consts::TAU)),
        // Base colors
        "COLOR_BLACK" => Ok(Value::Color(BLACK)),
        "COLOR_WHITE" => Ok(Value::Color(WHITE)),
        "COLOR_RED" => Ok(Value::Color(RED)),
        "COLOR_GREEN" => Ok(Value::Color(GREEN)),
        "COLOR_BLUE" => Ok(Value::Color(BLUE)),
        // Extended palette
        "COLOR_ORANGE" => Ok(Value::Color(ORANGE)),
        "COLOR_YELLOW" => Ok(Value::Color(YELLOW)),
        "COLOR_PINK" => Ok(Value::Color(PINK)),
        "COLOR_MAGENTA" => Ok(Value::Color(MAGENTA)),
        "COLOR_CYAN" => Ok(Value::Color(CYAN)),
        "COLOR_TEAL" => Ok(Value::Color(TEAL)),
        "COLOR_TURQUOISE" => Ok(Value::Color(TURQUOISE)),
        "COLOR_NAVY" => Ok(Value::Color(NAVY)),
        "COLOR_INDIGO" => Ok(Value::Color(INDIGO)),
        "COLOR_VIOLET" => Ok(Value::Color(VIOLET)),
        "COLOR_PURPLE" => Ok(Value::Color(PURPLE)),
        "COLOR_LAVENDER" => Ok(Value::Color(LAVENDER)),
        "COLOR_BROWN" => Ok(Value::Color(BROWN)),
        "COLOR_MAROON" => Ok(Value::Color(MAROON)),
        "COLOR_OLIVE" => Ok(Value::Color(OLIVE)),
        "COLOR_FOREST_GREEN" => Ok(Value::Color(FOREST_GREEN)),
        "COLOR_GOLD" => Ok(Value::Color(GOLD)),
        "COLOR_SILVER" => Ok(Value::Color(SILVER)),
        "COLOR_GRAY" => Ok(Value::Color(GRAY)),
        "COLOR_DARK_GRAY" => Ok(Value::Color(DARK_GRAY)),
        "COLOR_LIGHT_GRAY" => Ok(Value::Color(LIGHT_GRAY)),
        "COLOR_CRIMSON" => Ok(Value::Color(CRIMSON)),
        "COLOR_CORAL" => Ok(Value::Color(CORAL)),
        "COLOR_SALMON" => Ok(Value::Color(SALMON)),
        "COLOR_SAND" => Ok(Value::Color(SAND)),
        "COLOR_BEIGE" => Ok(Value::Color(BEIGE)),
        "COLOR_SKY_BLUE" => Ok(Value::Color(SKY_BLUE)),
        "COLOR_AMBER" => Ok(Value::Color(AMBER)),
        "COLOR_LIME" => Ok(Value::Color(LIME)),
        "COLOR_CHARTREUSE" => Ok(Value::Color(CHARTREUSE)),
        "COLOR_TAN" => Ok(Value::Color(TAN)),
        other => Err(format!("Unknown system value: ${}", other)),
    }
}

fn points_from_value(value: Value) -> Vec<Point2> {
    let mut points: Vec<Point2> = Vec::new();
    if let Value::Array(list_of_points) = value {
        for points_pair in list_of_points.iter() {
            if let Value::Array(points_vec) = points_pair {
                if points_vec.len() == 2 {
                    if let (Some(x), Some(y)) = (points_vec[0].as_f64(), points_vec[1].as_f64()) {
                        points.push(Point2::new(x, y));
                    }
                }
            }
        }
    }
    points
}

fn hsl_to_rgb(h: f64, s: f64, l: f64) -> (f64, f64, f64) {
    // Normalize hue to [0, 1]
    let h = h - h.floor();

    if s == 0.0 {
        return (l, l, l);
    }

    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;

    let r = hue_to_rgb(p, q, h + 1.0 / 3.0);
    let g = hue_to_rgb(p, q, h);
    let b = hue_to_rgb(p, q, h - 1.0 / 3.0);

    (r, g, b)
}

fn hue_to_rgb(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    if t < 1.0 / 6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0 / 2.0 { return q; }
    if t < 2.0 / 3.0 { return p + (q - p) * (2.0 / 3.0 - t) * 6.0; }
    p
}

/// Human-readable value kind, for error messages.
fn type_name(value: &Value) -> &'static str {
    match value {
        Value::Boolean(_) => "a boolean",
        Value::Integer(_) => "a whole number",
        Value::Float(_) => "a number",
        Value::String(_) => "a string",
        Value::Array(_) => "an array",
        Value::Bytes(_) => "an array",
        Value::Identifier(_) => "an identifier",
        Value::SystemValue(_) => "a system value",
        Value::Color(_) => "a color",
    }
}
