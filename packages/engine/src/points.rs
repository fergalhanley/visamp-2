//! Bounded procedural point fields, lowered to GLSL rather than interpreted per point.
use std::collections::HashMap;

use crate::interpreter::{evaluate_expression, Runtime};
use crate::model::*;

pub const MAX_POINTS: u32 = 1_000_000;
pub const MAX_DATA: usize = 32_768;
pub const DATA_WIDTH: usize = 1024;
const MAX_NODES: usize = 512;

#[derive(Debug, Clone)]
pub struct PointCloud {
    pub count: u32,
    pub size: f32,
    pub attenuation: bool,
    /// Only expressions generated from the AST; no author-supplied shader text.
    pub body: String,
    pub data: Vec<f32>,
}

pub fn build(
    call: &FunctionCall,
    declarations: &Declarations,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> Result<PointCloud, String> {
    let arg = |name: &str| {
        call.args
            .iter()
            .find(|a| a.name == name)
            .map(|a| &a.expression)
    };
    let eval = |expr: &Expression| evaluate_expression(expr, declarations, runtime, functions);
    let count =
        eval(arg("count").ok_or("draw::point_cloud: count is required")?)?.try_into_f64()?;
    if !count.is_finite() || count.fract() != 0.0 || count < 0.0 || count > MAX_POINTS as f64 {
        return Err(format!(
            "draw::point_cloud: count must be an integer from 0 to {MAX_POINTS}"
        ));
    }
    let size = match arg("size") {
        Some(e) => eval(e)?.try_into_f64()?,
        None => 2.0,
    };
    if !size.is_finite() || size < 0.0 || size > f32::MAX as f64 {
        return Err("draw::point_cloud: size must be finite and nonnegative".into());
    }
    let attenuation = match arg("size_attenuation") {
        Some(e) => match eval(e)? {
            Value::Boolean(v) => v,
            _ => return Err("draw::point_cloud: size_attenuation must be boolean".into()),
        },
        None => false,
    };
    let mut compiler = Fields {
        declarations,
        runtime,
        functions,
        count: count as u32,
        data: Vec::new(),
        bindings: HashMap::new(),
        nodes: 0,
    };
    let mut fields = Vec::new();
    for name in ["x", "y", "z"] {
        fields.push(match arg(name) {
            Some(e) => compiler.number(e, 0)?,
            None => "0.0".into(),
        });
    }
    let color = match arg("color") {
        Some(e) => compiler.color(e)?,
        None => "vec4(1.0)".into(),
    };
    Ok(PointCloud {
        count: count as u32,
        size: size as f32,
        attenuation,
        body: format!(
            "vec3 point_position = vec3({}, {}, {});\nvec4 point_color = {};",
            fields[0], fields[1], fields[2], color
        ),
        data: compiler.data,
    })
}

/// Per-point system values. Other expressions are evaluated once and
/// packed into a float texture, so changing time/audio does not recompile shaders.
fn dependent(expr: &Expression, depth: usize) -> Result<bool, String> {
    fn walk(expr: &Expression, depth: usize, nodes: &mut usize) -> Result<bool, String> {
        *nodes += 1;
        if depth > 128 || *nodes > MAX_NODES {
            return Err("point field expression is too complex".into());
        }
        let next = depth + 1;
        Ok(match expr {
            Expression::SystemValue(name) => name == "POINT_INDEX" || name == "POINT_COUNT",
            Expression::Grouping(e) | Expression::Unary { expr: e, .. } => walk(e, next, nodes)?,
            Expression::Binary { left, right, .. } => {
                walk(left, next, nodes)? | walk(right, next, nodes)?
            }
            Expression::Index { target, index } => {
                walk(target, next, nodes)? | walk(index, next, nodes)?
            }
            Expression::Array(values) => {
                let mut found = false;
                for v in values {
                    found |= walk(v, next, nodes)?;
                }
                found
            }
            Expression::ArrayFilled { args }
            | Expression::Call { args, .. }
            | Expression::MathCall { args, .. }
            | Expression::ColorConstruct { args, .. } => {
                let mut found = false;
                for (_, v) in args {
                    found |= walk(v, next, nodes)?;
                }
                found
            }
            _ => false,
        })
    }
    walk(expr, depth, &mut 0)
}

struct Fields<'a> {
    declarations: &'a Declarations,
    runtime: &'a Runtime,
    functions: &'a [FunctionDef],
    count: u32,
    data: Vec<f32>,
    bindings: HashMap<String, (usize, usize)>,
    nodes: usize,
}

impl Fields<'_> {
    fn eval(&self, expr: &Expression) -> Result<Value, String> {
        evaluate_expression(expr, self.declarations, self.runtime, self.functions)
    }

    fn store(&mut self, key: String, values: &[f32]) -> Result<(usize, usize), String> {
        if let Some(binding) = self.bindings.get(&key) {
            return Ok(*binding);
        }
        if self.data.len() + values.len() > MAX_DATA {
            return Err(format!("point field data exceeds {MAX_DATA} numbers"));
        }
        if values.iter().any(|v| !v.is_finite()) {
            return Err("point field inputs must be finite".into());
        }
        let binding = (self.data.len(), values.len());
        self.data.extend_from_slice(values);
        self.bindings.insert(key, binding);
        Ok(binding)
    }

    fn number(&mut self, expr: &Expression, depth: usize) -> Result<String, String> {
        self.nodes += 1;
        if self.nodes > MAX_NODES || depth > 128 {
            return Err("point field expression is too complex".into());
        }
        if !dependent(expr, 0)? {
            let key = format!("{expr:?}");
            let value = self.eval(expr)?.try_into_f64()? as f32;
            let (offset, _) = self.store(key, &[value])?;
            return Ok(format!("data_at({offset})"));
        }
        let d = depth + 1;
        Ok(match expr {
            Expression::SystemValue(name) if name == "POINT_INDEX" => "float(gl_VertexID)".into(),
            Expression::SystemValue(name) if name == "POINT_COUNT" => {
                let (offset, _) = self.store("$POINT_COUNT".into(), &[self.count as f32])?;
                format!("data_at({offset})")
            }
            Expression::Grouping(e) => format!("({})", self.number(e, d)?),
            Expression::Unary { op, expr } => {
                let sign = match op { UnaryOperator::Negate => "-", UnaryOperator::Plus => "+", _ => return Err("point fields support numeric unary + and - only".into()) };
                format!("({sign}{})", self.number(expr, d)?)
            }
            Expression::Binary { left, op, right } => {
                let a = self.number(left, d)?;
                let b = self.number(right, d)?;
                match op {
                    BinaryOperator::Add => format!("({a}+{b})"),
                    BinaryOperator::Subtract => format!("({a}-{b})"),
                    BinaryOperator::Multiply => format!("({a}*{b})"),
                    BinaryOperator::Divide => format!("({a}/{b})"),
                    BinaryOperator::IntegerDivide => format!("trunc({a}/{b})"),
                    BinaryOperator::Modulus => format!("mod({a},abs({b}))"),
                    _ => return Err("point fields support arithmetic operators only".into()),
                }
            }
            Expression::Index { target, index } => {
                if dependent(target, 0)? { return Err("point field arrays must be frame values".into()); }
                let key = format!("array:{target:?}");
                let (offset, len) = if let Some(binding) = self.bindings.get(&key) { *binding } else {
                    let values = match self.eval(target)? {
                        Value::Bytes(bytes) => {
                            if bytes.len() > MAX_DATA { return Err("point field array is too large".into()); }
                            bytes.iter().map(|v| *v as f32).collect::<Vec<_>>()
                        },
                        Value::Array(values) => {
                            if values.len() > MAX_DATA { return Err("point field array is too large".into()); }
                            values.into_iter().map(|v| v.try_into_f64().map(|v| v as f32)).collect::<Result<Vec<_>, _>>()?
                        }
                        _ => return Err("point field indexing needs a numeric array".into()),
                    };
                    self.store(key, &values)?
                };
                format!("array_at({offset}, {len}, {})", self.number(index, d)?)
            }
            Expression::MathCall { func, args } => {
                let names: &[&str] = match func.as_str() {
                    "sin" | "cos" | "tan" => &["radians"],
                    "atan2" => &["y", "x"],
                    "pow" => &["base", "exp"],
                    "min" | "max" => &["a", "b"],
                    "clamp" => &["value", "min", "max"],
                    _ => &["value"],
                };
                let mut parts = Vec::new();
                for name in names {
                    let e = args.iter().find(|(n, _)| n == name).ok_or_else(|| format!("math::{func}: missing {name}"))?;
                    parts.push(self.number(&e.1, d)?);
                }
                match func.as_str() {
                    "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "sqrt" | "abs" | "floor" | "ceil" | "trunc" | "pow" | "exp" | "log2" | "min" | "max" | "clamp" => format!("{}({})", func, parts.join(",")),
                    "atan2" => format!("atan({})", parts.join(",")),
                    "ln" => format!("log({})", parts[0]),
                    "log10" => format!("(log({})/log(10.0))", parts[0]),
                    "round" => format!("point_round({})", parts[0]),
                    "cbrt" => format!("point_cbrt({})", parts[0]),
                    _ => return Err(format!("math::{func} is not supported in point fields")),
                }
            }
            _ => return Err("point fields support numeric arithmetic, math calls and array reads; move other calculations outside draw::point_cloud".into()),
        })
    }

    fn color(&mut self, expr: &Expression) -> Result<String, String> {
        let per_point = dependent(expr, 0)?;
        if let Expression::Grouping(inner) = expr {
            return self.color(inner);
        }
        if !per_point {
            let c = self.eval(expr)?.try_into_color()?;
            let (offset, _) = self.store(
                format!("color:{expr:?}"),
                &[c.r as f32, c.g as f32, c.b as f32, c.a as f32],
            )?;
            return Ok(format!(
                "vec4(data_at({offset}),data_at({}),data_at({}),data_at({}))",
                offset + 1,
                offset + 2,
                offset + 3
            ));
        }
        let Expression::ColorConstruct { kind, args } = expr else {
            return Err("per-point colour must use color::rgb or color::hsl".into());
        };
        let names = match kind {
            ColorConstructKind::Rgb => ["r", "g", "b"],
            ColorConstructKind::Hsl => ["h", "s", "l"],
            _ => return Err("point clouds do not support gradients".into()),
        };
        let mut parts = Vec::new();
        for name in names.into_iter().chain(["transparent"]) {
            parts.push(match args.iter().find(|(n, _)| n == name) {
                Some((_, e)) => self.number(e, 0)?,
                None => "0.0".into(),
            });
        }
        let rgb = format!("vec3({},{},{})", parts[0], parts[1], parts[2]);
        let rgb = if matches!(kind, ColorConstructKind::Hsl) {
            format!("point_hsl({rgb})")
        } else {
            rgb
        };
        Ok(format!("vec4({rgb},1.0-{})", parts[3]))
    }
}
