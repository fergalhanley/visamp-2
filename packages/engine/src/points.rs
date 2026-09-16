//! Bounded procedural point fields, lowered to GLSL rather than interpreted per point.
use std::collections::HashMap;
use std::rc::Rc;

use crate::interpreter::{evaluate_expression, Runtime};
use crate::model::*;

pub const MAX_POINTS: u32 = 1_000_000;
pub const MAX_DATA: usize = 32_768;
pub const MAX_GRID_DATA: usize = 524_288;
pub const DATA_WIDTH: usize = 1024;
const MAX_NODES: usize = 512;

#[derive(Debug, Clone)]
pub struct PointCloud {
    pub count: u32,
    /// Connected triangle grid dimensions; None renders independent points.
    pub grid: Option<(u32, u32)>,
    pub size: f32,
    pub attenuation: bool,
    pub model: Option<(String, Rc<Vec<[f32; 3]>>)>,
    pub texture: Option<String>,
    pub alpha_test: f32,
    /// Only expressions generated from the AST; no author-supplied shader text.
    pub body: String,
    pub data: Vec<f32>,
}

pub fn build(
    call: &FunctionCall,
    declarations: &Declarations,
    runtime: &Runtime,
    functions: &[FunctionDef],
) -> Result<Option<PointCloud>, String> {
    let arg = |name: &str| {
        call.args
            .iter()
            .find(|a| a.name == name)
            .map(|a| &a.expression)
    };
    let eval = |expr: &Expression| evaluate_expression(expr, declarations, runtime, functions);
    let grid = if call.function == "grid" {
        let dimension = |name: &str| -> Result<u32, String> {
            let n = eval(arg(name).ok_or_else(|| format!("draw::grid: {name} is required"))?)?
                .try_into_f64()?;
            if !n.is_finite() || n.fract() != 0.0 || !(2.0..=4096.0).contains(&n) {
                return Err(format!(
                    "draw::grid: {name} must be a whole number from 2 to 4096"
                ));
            }
            Ok(n as u32)
        };
        let dimensions = (dimension("columns")?, dimension("rows")?);
        if dimensions.0 * dimensions.1 > MAX_POINTS {
            return Err(format!("draw::grid: vertex count exceeds {MAX_POINTS}"));
        }
        Some(dimensions)
    } else {
        None
    };
    let model_id = match arg("model") {
        Some(e) => match eval(e)? {
            Value::Asset(a) if a.kind == AssetKind::Model => Some(a.id),
            _ => return Err("draw::point_cloud: model needs a model asset reference".into()),
        },
        None => None,
    };
    let model = match model_id {
        Some(id) => match crate::assets::with_store(|store| store.points(&id)) {
            Some(points) => Some((id, points)),
            None => return Ok(None),
        },
        None => None,
    };
    let count = match arg("count") {
        Some(e) => eval(e)?.try_into_f64()?,
        None if grid.is_some() => {
            let (columns, rows) = grid.unwrap();
            (columns * rows) as f64
        }
        None => model
            .as_ref()
            .map(|(_, p)| p.len() as f64)
            .ok_or("draw::point_cloud: count or model is required")?,
    };
    if !count.is_finite() || count.fract() != 0.0 || count < 0.0 || count > MAX_POINTS as f64 {
        return Err(format!(
            "draw::point_cloud: count must be an integer from 0 to {MAX_POINTS}"
        ));
    }
    let texture = match arg("texture") {
        Some(e) => match eval(e)? {
            Value::Asset(a) if a.kind.is_texture() => Some(a.id),
            _ => {
                return Err(
                    "draw::point_cloud: texture needs a bitmap or vector asset reference".into(),
                )
            }
        },
        None => None,
    };
    let alpha_test = match arg("alpha_test") {
        Some(e) => eval(e)?.try_into_f64()?,
        None => 0.0,
    };
    if !alpha_test.is_finite() || !(0.0..=1.0).contains(&alpha_test) {
        return Err("draw::point_cloud: alpha_test must be between 0 and 1".into());
    }
    let size = match arg("size") {
        Some(e) if !dependent(e, 0)? => eval(e)?.try_into_f64()?,
        Some(_) => 1.0,
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
        has_model: model.is_some(),
        grid,
        data: Vec::new(),
        bindings: HashMap::new(),
        nodes: 0,
    };
    let mut fields = Vec::new();
    for (axis, name) in ["x", "y", "z"].iter().enumerate() {
        fields.push(match arg(name) {
            Some(e) => compiler.number(e, 0)?,
            None if grid.is_some() && *name != "y" => {
                let (columns, rows) = grid.unwrap();
                if *name == "x" {
                    format!(
                        "float(grid_vertex_id % {columns}) / {}.0 - 0.5",
                        columns - 1
                    )
                } else {
                    format!("float(grid_vertex_id / {columns}) / {}.0 - 0.5", rows - 1)
                }
            }
            None if model.is_some() => format!("model_at(float(gl_VertexID), {axis})"),
            None => "0.0".into(),
        });
    }
    let color = match arg("color") {
        Some(e) => compiler.color(e)?,
        None => "vec4(1.0)".into(),
    };
    let size_field = match arg("size") {
        Some(e) if dependent(e, 0)? => compiler.number(e, 0)?,
        _ => "u_size".into(),
    };
    let mut body = format!(
        "vec3 point_position = vec3({}, {}, {});\nvec4 point_color = {};\nfloat point_size = {};",
        fields[0], fields[1], fields[2], color, size_field
    );
    if let Some((columns, _)) = grid {
        // Two upward-facing triangles per cell. Derive connectivity from the
        // draw vertex, avoiding a CPU mesh rebuild or index upload each frame.
        body = body.replace("gl_VertexID", "grid_vertex_id");
        body = format!("int cell = gl_VertexID / 6; int corner = gl_VertexID % 6;\nint grid_vertex_id = (cell / {cells}) * {columns} + cell % {cells};\ngrid_vertex_id += (corner == 1 || corner == 3 || corner == 4 ? {columns} : 0) + (corner == 2 || corner == 4 || corner == 5 ? 1 : 0);\n{body}", cells = columns - 1);
    }
    Ok(Some(PointCloud {
        count: count as u32,
        grid,
        size: size as f32,
        attenuation,
        model,
        texture,
        alpha_test: alpha_test as f32,
        body,
        data: compiler.data,
    }))
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
            Expression::SystemValue(name) => matches!(
                name.as_str(),
                "GRID_INDEX"
                    | "GRID_COLUMN"
                    | "GRID_ROW"
                    | "POINT_INDEX"
                    | "POINT_COUNT"
                    | "POINT_X"
                    | "POINT_Y"
                    | "POINT_Z"
                    | "MODEL_X"
                    | "MODEL_Y"
                    | "MODEL_Z"
            ),
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
            | Expression::AudioCall { args, .. }
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
    has_model: bool,
    grid: Option<(u32, u32)>,
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
        let limit = if self.grid.is_some() {
            MAX_GRID_DATA
        } else {
            MAX_DATA
        };
        if self.data.len() + values.len() > limit {
            return Err(format!("procedural field data exceeds {limit} numbers"));
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
            Expression::SystemValue(name) if matches!(name.as_str(), "GRID_INDEX" | "GRID_COLUMN" | "GRID_ROW") => {
                let (columns, _) = self.grid.ok_or_else(|| format!("${name} requires draw::grid"))?;
                match name.as_str() {
                    "GRID_COLUMN" => format!("float(grid_vertex_id % {columns})"),
                    "GRID_ROW" => format!("float(grid_vertex_id / {columns})"),
                    _ => "float(grid_vertex_id)".into(),
                }
            }
            Expression::SystemValue(name) if matches!(name.as_str(), "POINT_X" | "POINT_Y" | "POINT_Z") => {
                if !self.has_model { return Err(format!("${name} requires a model on draw::point_cloud")); }
                let axis = match name.as_str() { "POINT_X" => 0, "POINT_Y" => 1, _ => 2 };
                format!("model_at(float(gl_VertexID), {axis})")
            }
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
                if let Expression::SystemValue(name) = target.as_ref() {
                    if matches!(name.as_str(), "MODEL_X" | "MODEL_Y" | "MODEL_Z") {
                        if !self.has_model { return Err(format!("${name} requires a model on draw::point_cloud")); }
                        let axis = match name.as_str() { "MODEL_X" => 0, "MODEL_Y" => 1, _ => 2 };
                        return Ok(format!("model_at({}, {axis})", self.number(index, d)?));
                    }
                }
                if dependent(target, 0)? { return Err("point field arrays must be frame values".into()); }
                let key = format!("array:{target:?}");
                let (offset, len) = if let Some(binding) = self.bindings.get(&key) { *binding } else {
                    let values = match self.eval(target)? {
                        Value::Samples(samples) => samples.as_ref().clone(),
                        Value::Bytes(bytes) => {
                            if bytes.len() > (if self.grid.is_some() { MAX_GRID_DATA } else { MAX_DATA }) { return Err("point field array is too large".into()); }
                            bytes.iter().map(|v| *v as f32).collect::<Vec<_>>()
                        },
                        Value::Array(values) => {
                            if values.len() > (if self.grid.is_some() { MAX_GRID_DATA } else { MAX_DATA }) { return Err("point field array is too large".into()); }
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
                    "sin" | "cos" | "tan" => &["rad"],
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
        for name in names {
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
        let alpha = if let Some((_, expr)) = args.iter().find(|(n, _)| n == "a") {
            self.number(expr, 0)?
        } else {
            "1.0".into()
        };
        Ok(format!("vec4({rgb},{alpha})"))
    }
}
