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
}

impl Runtime {
    pub fn new() -> Self {
        Runtime {
            frame_count: 0,
            canvas_width: 800.0,
            canvas_height: 600.0,
            mouse_x: 0.0,
            mouse_y: 0.0,
        }
    }
}

type InterpResult<T> = Result<T, String>;

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

pub fn interpret_layer_block(
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
                decels.push_scope();
                for stmt in &if_stmt.then_body {
                    if let Some(val) = interpret_statement(stmt, decels, runtime, ctx, functions)? {
                        decels.pop_scope();
                        return Ok(Some(val));
                    }
                }
                decels.pop_scope();
            } else if let Some(else_body) = &if_stmt.else_body {
                decels.push_scope();
                for stmt in else_body {
                    if let Some(val) = interpret_statement(stmt, decels, runtime, ctx, functions)? {
                        decels.pop_scope();
                        return Ok(Some(val));
                    }
                }
                decels.pop_scope();
            }
            Ok(None)
        }
        Statement::For(for_loop) => {
            let iterable = evaluate_expression(&for_loop.iterable, decels, runtime, functions)?;
            let items = match iterable {
                Value::Array(arr) => arr,
                _ => return Err("for loop iterable must be an array".to_string()),
            };
            for item in items {
                decels.push_scope();
                decels.declare(for_loop.variable.clone(), item);
                for stmt in &for_loop.body {
                    if let Some(val) = interpret_statement(stmt, decels, runtime, ctx, functions)? {
                        decels.pop_scope();
                        return Ok(Some(val));
                    }
                }
                decels.pop_scope();
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
                decels.push_scope();
                for stmt in &while_loop.body {
                    if let Some(val) = interpret_statement(stmt, decels, runtime, ctx, functions)? {
                        decels.pop_scope();
                        return Ok(Some(val));
                    }
                }
                decels.pop_scope();
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
                        color = evaluated.into_color();
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
                        "color" => color = evaluated.into_color(),
                        "rotate" => rotate = evaluated.into_f64(),
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
                        "x" => x = evaluated.into_f64(),
                        "y" => y = evaluated.into_f64(),
                        "radius" => radius = evaluated.into_f64(),
                        "color" => color = evaluated.into_color(),
                        "stroke" => stroke = matches!(evaluated, Value::Boolean(true)),
                        "stroke_weight" => stroke_weight = evaluated.into_f64(),
                        "stroke_color" => stroke_color = evaluated.into_color(),
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
                        "x" => x = evaluated.into_f64(),
                        "y" => y = evaluated.into_f64(),
                        "width" | "w" => w = evaluated.into_f64(),
                        "height" | "h" => h = evaluated.into_f64(),
                        "color" => color = evaluated.into_color(),
                        "stroke" => stroke = matches!(evaluated, Value::Boolean(true)),
                        "stroke_weight" => stroke_weight = evaluated.into_f64(),
                        "stroke_color" => stroke_color = evaluated.into_color(),
                        "rotate" => rotate = evaluated.into_f64(),
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
                        "x1" => x1 = evaluated.into_f64(),
                        "y1" => y1 = evaluated.into_f64(),
                        "x2" => x2 = evaluated.into_f64(),
                        "y2" => y2 = evaluated.into_f64(),
                        "color" => color = evaluated.into_color(),
                        "stroke_weight" => stroke_weight = evaluated.into_f64(),
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
                        "x" => x = evaluated.into_f64(),
                        "y" => y = evaluated.into_f64(),
                        "rx" | "radius_x" => rx = evaluated.into_f64(),
                        "ry" | "radius_y" => ry = evaluated.into_f64(),
                        "color" => color = evaluated.into_color(),
                        "stroke" => stroke = matches!(evaluated, Value::Boolean(true)),
                        "stroke_weight" => stroke_weight = evaluated.into_f64(),
                        "stroke_color" => stroke_color = evaluated.into_color(),
                        "rotate" => rotate = evaluated.into_f64(),
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
                        "x" => x = evaluated.into_f64(),
                        "y" => y = evaluated.into_f64(),
                        "size" => size = evaluated.into_f64(),
                        "color" => color = evaluated.into_color(),
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
            let l = evaluate_expression(left, decels, runtime, functions)?;
            let r = evaluate_expression(right, decels, runtime, functions)?;
            match op {
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
                BinaryOperator::Divide => match (l, r) {
                    (Value::Integer(a), Value::Integer(b)) if b != 0 => Ok(Value::Integer(a / b)),
                    (Value::Float(a), Value::Float(b)) if b != 0.0 => Ok(Value::Float(a / b)),
                    (Value::Integer(a), Value::Float(b)) if b != 0.0 => Ok(Value::Float(a as f64 / b)),
                    (Value::Float(a), Value::Integer(b)) if b != 0 => Ok(Value::Float(a / b as f64)),
                    _ => Err("Division by zero or type error for '/'".to_string()),
                },
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
            let mut get_arg = |name: &str| -> InterpResult<f64> {
                for (n, expr) in args.iter() {
                    if n == name {
                        let val = evaluate_expression(expr, decels, runtime, functions)?;
                        return Ok(val.into_f64());
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
            let mut get_arg = |name: &str| -> f64 {
                for (n, expr) in args.iter() {
                    if n == name {
                        if let Ok(val) = evaluate_expression(expr, decels, runtime, functions) {
                            return val.into_f64();
                        }
                    }
                }
                0.0
            };

            match kind {
                ColorConstructKind::Rgb => {
                    let r = get_arg("red").clamp(0.0, 1.0);
                    let g = get_arg("green").clamp(0.0, 1.0);
                    let b = get_arg("blue").clamp(0.0, 1.0);
                    let a = if args.iter().any(|(n, _)| n == "transparent") {
                        1.0 - get_arg("transparent").clamp(0.0, 1.0)
                    } else {
                        1.0
                    };
                    Ok(Value::Color(Color::new(r, g, b, a)))
                }
                ColorConstructKind::Hsl => {
                    let h = get_arg("hue");
                    let s = get_arg("saturation").clamp(0.0, 1.0);
                    let l = get_arg("lightness").clamp(0.0, 1.0);
                    let a = if args.iter().any(|(n, _)| n == "transparent") {
                        1.0 - get_arg("transparent").clamp(0.0, 1.0)
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

fn map_value_runtime(name: &str, runtime: &Runtime) -> InterpResult<Value> {
    match name {
        "TIME_SEC" => Ok(Value::Float(start_time_ms() as f64 / 1000.0)),
        "TIME_MS" => Ok(Value::Integer(start_time_ms() as i64)),
        "WIDTH" => Ok(Value::Float(runtime.canvas_width)),
        "HEIGHT" => Ok(Value::Float(runtime.canvas_height)),
        "MOUSE_X" => Ok(Value::Float(runtime.mouse_x)),
        "MOUSE_Y" => Ok(Value::Float(runtime.mouse_y)),
        "FRAME_COUNT" => Ok(Value::Integer(runtime.frame_count as i64)),
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
