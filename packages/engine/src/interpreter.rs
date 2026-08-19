use web_sys::CanvasRenderingContext2d;

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
    pub time_domain: Vec<u8>,
    pub frequency: Vec<u8>,
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
            time_domain: Vec::new(),
            frequency: Vec::new(),
            beat: false,
        }
    }
}

/// Byte analyser data as a DSL array. Allocates, so callers should bind it to a
/// `let` rather than re-reading it inside a loop.
fn byte_array_value(bytes: &[u8]) -> Value {
    Value::Array(bytes.iter().map(|b| Value::Integer(*b as i64)).collect())
}

type InterpResult<T> = Result<T, String>;

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

pub fn interpret_event_block(block: &Block, decels: &mut Declarations, runtime: &Runtime, functions: &[FunctionDef]) -> InterpResult<()> {
    decels.push_scope();
    let result = (|| {
        for statement in block.statements.iter() {
            interpret_statement(statement, decels, runtime, None, functions)?;
        }
        Ok(())
    })();
    decels.pop_scope();
    result
}

pub fn interpret_render_block(
    block: &Block,
    decels: &mut Declarations,
    ctx: &CanvasRenderingContext2d,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> InterpResult<()> {
    decels.push_scope();
    let result = (|| {
        let statements = block.statements.iter().cloned().collect::<Vec<_>>();
        for statement in statements {
            interpret_statement(&statement, decels, runtime, Some(ctx), functions)?;
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
    ctx: Option<&CanvasRenderingContext2d>,
    functions: &[FunctionDef],
) -> InterpResult<Option<Value>> {
    decels.push_scope();
    if let Some((name, value)) = binding {
        decels.declare(name.to_string(), value);
    }
    let mut result = Ok(None);
    for stmt in body {
        match interpret_statement(stmt, decels, runtime, ctx, functions) {
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
    ctx: Option<&CanvasRenderingContext2d>,
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
        Statement::FunctionCall(function_call) => {
            if let Some(ctx) = ctx {
                interpret_statement_function_call(function_call, decels, ctx, runtime, functions)?;
            }
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
                    run_scoped_body(&if_stmt.then_body, None, decels, runtime, ctx, functions)?
                {
                    return Ok(Some(val));
                }
            } else if let Some(else_body) = &if_stmt.else_body {
                if let Some(val) =
                    run_scoped_body(else_body, None, decels, runtime, ctx, functions)?
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
                            ctx,
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
                    ctx,
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
                    run_scoped_body(&while_loop.body, None, decels, runtime, ctx, functions)?
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

#[allow(deprecated)]
fn interpret_statement_function_call(
    function_call: &FunctionCall,
    decels: &mut Declarations,
    ctx: &CanvasRenderingContext2d,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> InterpResult<()> {
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
                ctx.set_fill_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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

                    ctx.set_fill_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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
                    ctx.set_stroke_style(&wasm_bindgen::JsValue::from_str(&stroke_color.to_css()));
                    ctx.set_line_width(stroke_weight);
                    ctx.stroke();
                } else {
                    ctx.set_fill_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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
                    ctx.set_stroke_style(&wasm_bindgen::JsValue::from_str(&stroke_color.to_css()));
                    ctx.set_line_width(stroke_weight);
                    ctx.stroke_rect(x, y, w, h);
                } else {
                    ctx.set_fill_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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
                ctx.set_stroke_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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
                    ctx.set_stroke_style(&wasm_bindgen::JsValue::from_str(&stroke_color.to_css()));
                    ctx.set_line_width(stroke_weight);
                    ctx.stroke();
                } else {
                    ctx.set_fill_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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

                ctx.set_fill_style(&wasm_bindgen::JsValue::from_str(&color.to_css()));
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
            let items = match collection {
                Value::Array(items) => items,
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
                if let Some(val) = interpret_statement(stmt, &mut func_decels, runtime, None, functions)? {
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
                    let r = get_arg("red")?.clamp(0.0, 1.0);
                    let g = get_arg("green")?.clamp(0.0, 1.0);
                    let b = get_arg("blue")?.clamp(0.0, 1.0);
                    let a = if args.iter().any(|(n, _)| n == "transparent") {
                        1.0 - get_arg("transparent")?.clamp(0.0, 1.0)
                    } else {
                        1.0
                    };
                    Ok(Value::Color(Color::new(r, g, b, a)))
                }
                ColorConstructKind::Hsl => {
                    let h = get_arg("hue")?;
                    let s = get_arg("saturation")?.clamp(0.0, 1.0);
                    let l = get_arg("lightness")?.clamp(0.0, 1.0);
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
        Value::Identifier(_) => "an identifier",
        Value::SystemValue(_) => "a system value",
        Value::Color(_) => "a color",
    }
}
