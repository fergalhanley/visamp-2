//! Resolved drawing commands shared by Canvas2D, overlays and planar 3D meshes.
use crate::{math3::Mat4, model::*, scene::MeshData};
use std::{cell::RefCell, collections::BTreeMap};
use web_sys::CanvasRenderingContext2d;
pub const MAX_PATH_POINTS: usize = 4096;
#[derive(Debug, Clone)]
pub struct Call {
    pub location: Option<SourceLocation>,
    pub namespace: String,
    pub name: String,
    pub args: BTreeMap<String, Value>,
}
impl Call {
    pub fn value_count(&self) -> Result<usize, String> {
        fn count(v: &Value) -> Result<usize, String> {
            crate::interpreter::charge_execution_step()?;
            Ok(match v {
                Value::Array(a) => {
                    let mut n = 1;
                    for v in a {
                        n += count(v)?;
                    }
                    n
                }
                Value::String(s) => s.len(),
                _ => 1,
            })
        }
        let mut n = 0;
        for v in self.args.values() {
            n += count(v)?;
        }
        Ok(n)
    }

    pub fn number(&self, key: &str, default: f64) -> Result<f64, String> {
        let v = match self.args.get(key) {
            Some(v) => v.clone().try_into_f64()?,
            None => default,
        };
        if !v.is_finite() || v.abs() > f32::MAX as f64 {
            return Err(format!(
                "{}::{}: {key} must be finite",
                self.namespace, self.name
            ));
        }
        Ok(v)
    }
    pub fn boolean(&self, key: &str, default: bool) -> Result<bool, String> {
        match self.args.get(key) {
            Some(Value::Boolean(v)) => Ok(*v),
            None => Ok(default),
            _ => Err(format!("{}: {key} must be boolean", self.name)),
        }
    }
    pub fn text(&self, key: &str, default: &str) -> Result<String, String> {
        match self.args.get(key) {
            Some(Value::String(v)) => Ok(v.clone()),
            None => Ok(default.into()),
            _ => Err(format!("{}: {key} must be a string", self.name)),
        }
    }
    pub fn color(&self, key: &str, default: Color) -> Result<Color, String> {
        self.args
            .get(key)
            .cloned()
            .map(Value::try_into_color)
            .unwrap_or(Ok(default))
    }
    pub fn angle(&self, stem: &str) -> Result<f64, String> {
        let rad = format!("{stem}rad");
        let deg = format!("{stem}deg");
        if self.args.contains_key(&rad) && self.args.contains_key(&deg) {
            return Err(format!("{}: specify {rad} or {deg}, not both", self.name));
        }
        if self.args.contains_key(&deg) {
            Ok(self.number(&deg, 0.0)?.to_radians())
        } else {
            self.number(&rad, 0.0)
        }
    }
    pub fn points(&self, dim: usize) -> Result<Vec<[f64; 3]>, String> {
        let Some(Value::Array(points)) = self.args.get("points") else {
            return Err(format!("draw::{}: points must be an array", self.name));
        };
        if points.len() > MAX_PATH_POINTS {
            return Err("path exceeds 4096 input points".into());
        }
        points
            .iter()
            .map(|point| {
                let Value::Array(values) = point else {
                    return Err("each point must be an array".into());
                };
                if values.len() != dim {
                    return Err(format!("each point must contain {dim} coordinates"));
                }
                let mut p = [0.0; 3];
                for (i, v) in values.iter().enumerate() {
                    p[i] = v.clone().try_into_f64()?;
                    if !p[i].is_finite() || p[i].abs() > f32::MAX as f64 {
                        return Err("point coordinates must be finite".into());
                    }
                }
                Ok(p)
            })
            .collect()
    }
}
#[derive(Default)]
pub struct CanvasState {
    stack: Vec<Mat4>,
    pub path_points: usize,
}
impl CanvasState {
    pub fn balanced(&self) -> Result<(), String> {
        if self.stack.len() > 1 {
            Err("unbalanced transform stack: missing pop".into())
        } else {
            Ok(())
        }
    }
}
fn js_error(_: wasm_bindgen::JsValue) -> String {
    "canvas drawing failed".into()
}
fn paint(ctx: &CanvasRenderingContext2d, c: &Call, stroke: bool) -> Result<(), String> {
    let gradient = c
        .args
        .get("gradient")
        .cloned()
        .map(Value::try_into_gradient)
        .transpose()?;
    let color = c.color(
        if stroke && !matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc") {
            "stroke_color"
        } else {
            "color"
        },
        if stroke && !matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc") {
            BLACK
        } else {
            WHITE
        },
    )?;
    if stroke {
        crate::interpreter::set_stroke_paint(ctx, color, gradient.as_deref());
        let width = c.number("stroke_width", 1.0)?;
        if width <= 0.0 {
            return Err("stroke_width must be positive".into());
        }
        ctx.set_line_width(width);
        let cap = c.text("line_cap", "butt")?;
        let join = c.text("line_join", "bevel")?;
        if !["butt", "round", "square"].contains(&cap.as_str())
            || !["round", "bevel"].contains(&join.as_str())
        {
            return Err("line_cap must be butt/round/square; line_join must be round/bevel".into());
        }
        ctx.set_line_cap(&cap);
        ctx.set_line_join(&join);
    } else {
        crate::interpreter::set_fill_paint(ctx, color, gradient.as_deref());
    }
    Ok(())
}
pub fn canvas(
    c: &Call,
    ctx: &CanvasRenderingContext2d,
    state: &RefCell<CanvasState>,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if c.namespace == "transform" {
        let mut state = state.borrow_mut();
        if state.stack.is_empty() {
            state.stack.push(Mat4::IDENTITY);
        }
        match c.name.as_str() {
            "push" => {
                if state.stack.len() >= 64 {
                    return Err("transform stack limit (64)".into());
                }
                let top = *state.stack.last().unwrap();
                state.stack.push(top);
            }
            "pop" => {
                if state.stack.len() == 1 {
                    return Err("transform stack underflow".into());
                }
                state.stack.pop();
            }
            "identity" => *state.stack.last_mut().unwrap() = Mat4::IDENTITY,
            name => {
                let m = match name {
                    "translate" => Mat4::translation(
                        c.number("x", 0.0)? as f32,
                        c.number("y", 0.0)? as f32,
                        0.0,
                    ),
                    "rotate_z" => Mat4::rotation_z(c.angle("")? as f32),
                    "scale" => {
                        if c.args.contains_key("all")
                            && (c.args.contains_key("x") || c.args.contains_key("y"))
                        {
                            return Err("transform::scale: all conflicts with axis scales".into());
                        }
                        let all = c.number("all", 1.0)?;
                        Mat4::scaling(c.number("x", all)? as f32, c.number("y", all)? as f32, 1.0)
                    }
                    _ => return Err("transform unavailable in 2d".into()),
                };
                let top = state.stack.last_mut().unwrap();
                *top = top.mul(&m);
            }
        }
        let m = state.stack.last().unwrap().as_slice();
        if m.iter().any(|v| !v.is_finite()) {
            return Err("transform exceeds finite coordinate range".into());
        }
        ctx.set_transform(
            m[0] as f64,
            m[1] as f64,
            m[4] as f64,
            m[5] as f64,
            m[12] as f64,
            m[13] as f64,
        )
        .map_err(js_error)?;
        return Ok(());
    }
    if c.namespace == "gfx" && c.name == "blend" {
        let mode = c.text("mode", "alpha")?;
        let operation = match mode.as_str() {
            "alpha" => "source-over",
            "additive" => "lighter",
            "multiply" => "multiply",
            "none" => "copy",
            _ => return Err("gfx::blend: expected alpha, additive, multiply or none".into()),
        };
        return ctx
            .set_global_composite_operation(operation)
            .map_err(js_error);
    }
    if c.namespace != "draw" {
        return Err(format!("{} is unavailable in 2d", c.namespace));
    }
    ctx.save();
    let result = (|| {
        if matches!(c.name.as_str(), "clear" | "background") {
            ctx.reset_transform().map_err(js_error)?;
            if c.name == "clear" {
                ctx.clear_rect(0.0, 0.0, width, height);
            } else {
                crate::interpreter::set_fill_paint(
                    ctx,
                    c.color("color", BLACK)?,
                    c.args
                        .get("gradient")
                        .cloned()
                        .map(Value::try_into_gradient)
                        .transpose()?
                        .as_deref(),
                );
                ctx.fill_rect(0.0, 0.0, width, height);
            }
            return Ok(());
        }
        if c.name == "image" {
            return image(c, ctx);
        }
        if c.name == "text" {
            paint(ctx, c, false)?;
            let size = c.number("size", 16.0)?;
            if size <= 0.0 {
                return Err("text size must be positive".into());
            }
            ctx.set_font(&format!("{size}px {}", c.text("font", "monospace")?));
            ctx.fill_text(
                &c.text("content", "")?,
                c.number("x", 0.0)?,
                c.number("y", 0.0)?,
            )
            .map_err(js_error)?;
            return Ok(());
        }
        let matrix = state
            .borrow()
            .stack
            .last()
            .copied()
            .unwrap_or(Mat4::IDENTITY)
            .mul(&Mat4::rotation_z(c.angle("rotation_")? as f32));
        let project = |p: [f64; 3]| {
            let q = matrix.transform_point(p.map(|v| v as f32));
            [q[0] as f64, q[1] as f64]
        };
        let (points, closed, pivot) = path(c, 2, &project)?;
        {
            let mut s = state.borrow_mut();
            s.path_points += points.len();
            if s.path_points > 65536 {
                return Err("render path budget exceeded (65536 points)".into());
            }
        }
        let angle = c.angle("rotation_")?;
        ctx.translate(pivot[0], pivot[1]).map_err(js_error)?;
        ctx.rotate(angle).map_err(js_error)?;
        ctx.translate(-pivot[0], -pivot[1]).map_err(js_error)?;
        let stroke = matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc")
            || c.boolean("stroke", false)?;
        paint(ctx, c, stroke)?;
        ctx.begin_path();
        if let Some(first) = points.first() {
            ctx.move_to(first[0], first[1]);
            for p in points.iter().skip(1) {
                ctx.line_to(p[0], p[1]);
            }
            if closed {
                ctx.close_path();
            }
            if stroke {
                ctx.stroke();
            } else {
                ctx.fill();
            }
        }
        Ok(())
    })();
    ctx.restore();
    result
}
thread_local! {static IMAGES:RefCell<BTreeMap<String,(u32,web_sys::HtmlCanvasElement)>>=RefCell::new(BTreeMap::new());}
fn image(c: &Call, ctx: &CanvasRenderingContext2d) -> Result<(), String> {
    use wasm_bindgen::JsCast;
    let Some(Value::Asset(asset)) = c.args.get("asset") else {
        return Err("draw::image: asset must be a bitmap or vector reference".into());
    };
    if !asset.kind.is_texture() {
        return Err("draw::image requires a bitmap/vector asset".into());
    }
    let w = c.number("width", 0.0)?;
    let h = c.number("height", 0.0)?;
    if w <= 0.0 || h <= 0.0 {
        return Err("draw::image: width and height must be positive".into());
    }
    let opacity = c.number("opacity", 1.0)?;
    if !(0.0..=1.0).contains(&opacity) {
        return Err("image opacity must be 0..1".into());
    }
    let canvas = crate::assets::with_store(
        |store| -> Result<Option<web_sys::HtmlCanvasElement>, String> {
            let Some(pixels) = store.texture(&asset.id) else {
                return Ok(None);
            };
            IMAGES.with(|images| {
                let mut cache = images.borrow_mut();
                if let Some((version, canvas)) = cache.get(&asset.id) {
                    if *version == pixels.version {
                        return Ok(Some(canvas.clone()));
                    }
                }
                // Bound CPU-side image cache; asset changes use the store version.
                if cache.len() >= 32
                    || cache
                        .values()
                        .map(|(_, c)| c.width() as u64 * c.height() as u64 * 4)
                        .sum::<u64>()
                        + pixels.rgba.len() as u64
                        > 64 * 1024 * 1024
                {
                    cache.clear();
                }
                let canvas = web_sys::window()
                    .and_then(|w| w.document())
                    .ok_or("no document")?
                    .create_element("canvas")
                    .map_err(js_error)?
                    .dyn_into::<web_sys::HtmlCanvasElement>()
                    .map_err(|_| "not a canvas")?;
                canvas.set_width(pixels.width);
                canvas.set_height(pixels.height);
                let context = canvas
                    .get_context("2d")
                    .map_err(js_error)?
                    .ok_or("no image context")?
                    .dyn_into::<CanvasRenderingContext2d>()
                    .map_err(|_| "not 2d")?;
                let rgba = &pixels.rgba;
                let data = web_sys::ImageData::new_with_u8_clamped_array_and_sh(
                    wasm_bindgen::Clamped(&rgba),
                    pixels.width,
                    pixels.height,
                )
                .map_err(js_error)?;
                context.put_image_data(&data, 0.0, 0.0).map_err(js_error)?;
                cache.insert(asset.id.clone(), (pixels.version, canvas.clone()));
                Ok(Some(canvas))
            })
        },
    )?;
    if let Some(canvas) = canvas {
        ctx.set_global_alpha(opacity);
        ctx.draw_image_with_html_canvas_element_and_dw_and_dh(
            &canvas,
            c.number("x", 0.0)?,
            c.number("y", 0.0)?,
            w,
            h,
        )
        .map_err(js_error)?;
    }
    Ok(())
}
/// Bounded point generation; shared shape anchors and winding across backends.
pub fn path(
    c: &Call,
    dim: usize,
    project: &dyn Fn([f64; 3]) -> [f64; 2],
) -> Result<(Vec<[f64; 3]>, bool, [f64; 3]), String> {
    let x = c.number("x", 0.0)?;
    let y = c.number("y", 0.0)?;
    let z = if dim == 3 { c.number("z", 0.0)? } else { 0.0 };
    let mut centre = [x, y, z];
    let mut closed = true;
    let points = match c.name.as_str() {
        "line" => {
            closed = false;
            vec![
                [
                    c.number("x1", 0.0)?,
                    c.number("y1", 0.0)?,
                    c.number("z1", 0.0)?,
                ],
                [
                    c.number("x2", 100.0)?,
                    c.number("y2", 100.0)?,
                    c.number("z2", 0.0)?,
                ],
            ]
        }
        "polygon" | "polyline" => {
            let p = c.points(dim)?;
            closed = if c.name == "polyline" {
                c.boolean("closed", false)?
            } else {
                true
            };
            let min = if closed { 3 } else { 2 };
            if p.len() < min {
                return Err(format!("draw::{}: at least {min} points required", c.name));
            }
            for axis in 0..3 {
                centre[axis] = p.iter().map(|v| v[axis]).sum::<f64>() / p.len() as f64;
            }
            p
        }
        "bezier" => {
            closed = false;
            let p = c.points(dim)?;
            if p.len() != 4 {
                return Err("draw::bezier requires exactly four control points".into());
            }
            let mut out = vec![p[0]];
            subdivide([p[0], p[1], p[2], p[3]], 0, &mut out, project)?;
            out
        }
        "circle" | "ellipse" | "arc" => {
            let rx = c.number(
                if c.name == "ellipse" {
                    "radius_x"
                } else {
                    "radius"
                },
                50.0,
            )?;
            let ry = if c.name == "ellipse" {
                c.number("radius_y", 30.0)?
            } else {
                rx
            };
            if rx <= 0.0 || ry <= 0.0 {
                return Err("radii must be positive".into());
            }
            let start = if c.name == "arc" {
                c.angle("start_")?
            } else {
                0.0
            };
            let sweep = if c.name == "arc" {
                closed = false;
                let s = c.angle("sweep_")?;
                if s.abs() > std::f64::consts::TAU + 1e-10 {
                    return Err("arc sweep must not exceed a full turn".into());
                }
                s
            } else {
                std::f64::consts::TAU
            };
            if sweep == 0.0 {
                return Ok((vec![], false, centre));
            }
            let segments = ((sweep.abs() * rx.max(ry).sqrt() * 2.0).ceil() as usize).clamp(8, 1023);
            (0..if closed { segments } else { segments + 1 })
                .map(|i| {
                    let a = start + sweep * i as f64 / segments as f64;
                    [x + a.cos() * rx, y + a.sin() * ry, z]
                })
                .collect()
        }
        "rect" => {
            let w = c.number("width", 100.0)?;
            let h = c.number("height", 100.0)?;
            if w <= 0.0 || h <= 0.0 {
                return Err("rectangle dimensions must be positive".into());
            }
            let r = c.number("corner_radius", 0.0)?;
            if r < 0.0 {
                return Err("corner_radius must be nonnegative".into());
            }
            let r = r.min(w.min(h) * 0.5);
            centre = [x + w * 0.5, y + h * 0.5, z];
            if r == 0.0 {
                vec![[x, y, z], [x + w, y, z], [x + w, y + h, z], [x, y + h, z]]
            } else {
                let mut p = Vec::new();
                for (cx, cy, start) in [
                    (x + w - r, y + r, -std::f64::consts::FRAC_PI_2),
                    (x + w - r, y + h - r, 0.0),
                    (x + r, y + h - r, std::f64::consts::FRAC_PI_2),
                    (x + r, y + r, std::f64::consts::PI),
                ] {
                    for i in 0..=16 {
                        let a = start + i as f64 * std::f64::consts::FRAC_PI_2 / 16.0;
                        p.push([cx + r * a.cos(), cy + r * a.sin(), z]);
                    }
                }
                p
            }
        }
        _ => return Err(format!("draw::{} has no path implementation", c.name)),
    };
    Ok((points, closed, centre))
}
fn subdivide(
    p: [[f64; 3]; 4],
    depth: usize,
    out: &mut Vec<[f64; 3]>,
    project: &dyn Fn([f64; 3]) -> [f64; 2],
) -> Result<(), String> {
    if out.len() >= 4096 {
        return Err("Bezier tessellation budget exceeded".into());
    }
    crate::interpreter::charge_execution_step()?;
    let q = p.map(project);
    let mut error: f64 = 0.0;
    for a in 0..2 {
        error = error
            .max((q[0][a] - 2.0 * q[1][a] + q[2][a]).abs())
            .max((q[1][a] - 2.0 * q[2][a] + q[3][a]).abs());
    }
    if error <= 0.25 || depth >= 12 {
        out.push(p[3]);
        return Ok(());
    }
    let midpoint = |a: [f64; 3], b: [f64; 3]| std::array::from_fn(|i| (a[i] + b[i]) * 0.5);
    let a = midpoint(p[0], p[1]);
    let b = midpoint(p[1], p[2]);
    let c = midpoint(p[2], p[3]);
    let d = midpoint(a, b);
    let e = midpoint(b, c);
    let f = midpoint(d, e);
    subdivide([p[0], a, d, f], depth + 1, out, project)?;
    subdivide([f, e, c, p[3]], depth + 1, out, project)
}
fn orient(a: [f64; 3], b: [f64; 3], c: [f64; 3]) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}
fn segments_intersect(a: [f64; 3], b: [f64; 3], c: [f64; 3], d: [f64; 3]) -> bool {
    let within = |p: [f64; 3], q: [f64; 3], r: [f64; 3]| {
        orient(p, q, r).abs() < 1e-10
            && (p[0].min(q[0])..=p[0].max(q[0])).contains(&r[0])
            && (p[1].min(q[1])..=p[1].max(q[1])).contains(&r[1])
    };
    orient(a, b, c) * orient(a, b, d) < 0.0 && orient(c, d, a) * orient(c, d, b) < 0.0
        || within(a, b, c)
        || within(a, b, d)
        || within(c, d, a)
        || within(c, d, b)
}
pub fn triangulate(points: &[[f64; 3]]) -> Result<MeshData, String> {
    let mut p = points.to_vec();
    p.dedup_by(|a, b| (0..3).all(|i| (a[i] - b[i]).abs() < 1e-10));
    if p.len() > 1 && (0..3).all(|i| (p[0][i] - p[p.len() - 1][i]).abs() < 1e-10) {
        p.pop();
    }
    if p.len() < 3 {
        return Ok(MeshData::default());
    }
    if p.len() > 1024 {
        return Err("filled polygon exceeds 1024 vertices".into());
    }
    // Reject crossings before ear clipping. No holes or self-intersecting fill.
    for i in 0..p.len() {
        for j in i + 1..p.len() {
            crate::interpreter::charge_execution_step()?;
            if j == i + 1 || (i == 0 && j == p.len() - 1) {
                continue;
            }
            let a = p[i];
            let b = p[(i + 1) % p.len()];
            let c = p[j];
            let d = p[(j + 1) % p.len()];
            if segments_intersect(a, b, c, d) {
                return Err("polygon must be simple (no self-intersections)".into());
            }
        }
    }
    let area = (0..p.len())
        .map(|i| p[i][0] * p[(i + 1) % p.len()][1] - p[(i + 1) % p.len()][0] * p[i][1])
        .sum::<f64>();
    if area.abs() < 1e-12 {
        return Err("polygon has no area".into());
    }
    let sign = area.signum();
    let mut remaining: Vec<usize> = (0..p.len()).collect();
    let mut indices = Vec::new();
    while remaining.len() > 3 {
        let mut ear = None;
        for i in 0..remaining.len() {
            let a = remaining[(i + remaining.len() - 1) % remaining.len()];
            let b = remaining[i];
            let c = remaining[(i + 1) % remaining.len()];
            if orient(p[a], p[b], p[c]) * sign <= 1e-10 {
                continue;
            }
            let mut blocked = false;
            for &j in &remaining {
                crate::interpreter::charge_execution_step()?;
                if j != a
                    && j != b
                    && j != c
                    && orient(p[a], p[b], p[j]) * sign >= 0.0
                    && orient(p[b], p[c], p[j]) * sign >= 0.0
                    && orient(p[c], p[a], p[j]) * sign >= 0.0
                {
                    blocked = true;
                    break;
                }
            }
            if !blocked {
                ear = Some((i, [a as u32, b as u32, c as u32]));
                break;
            }
        }
        let Some((i, triangle)) = ear else {
            return Err("polygon is degenerate or self-intersecting".into());
        };
        indices.extend(triangle);
        remaining.remove(i);
    }
    indices.extend(remaining.iter().map(|i| *i as u32));
    let lo = [
        p.iter().map(|p| p[0]).fold(f64::INFINITY, f64::min),
        p.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min),
    ];
    let hi = [
        p.iter().map(|p| p[0]).fold(f64::NEG_INFINITY, f64::max),
        p.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max),
    ];
    Ok(MeshData {
        vertices: p.iter().map(|p| p.map(|v| v as f32)).collect(),
        normals: vec![[0.0, 0.0, sign as f32]; p.len()],
        uvs: p
            .iter()
            .map(|p| {
                [
                    ((p[0] - lo[0]) / (hi[0] - lo[0]).max(1e-8)) as f32,
                    ((p[1] - lo[1]) / (hi[1] - lo[1]).max(1e-8)) as f32,
                ]
            })
            .collect(),
        indices,
    })
}
fn ribbon(
    points: &[[f64; 3]],
    closed: bool,
    width: f32,
    camera: &crate::scene::Camera,
    round_join: bool,
    cap: &str,
) -> Result<MeshData, String> {
    // Construct continuous cross-sections in the camera plane. Shared inner
    // corners avoid double-blending translucent joins; GL clips triangles at
    // the near plane. Width remains in world units, including orthographic views.
    let view = camera.view();
    let mut p: Vec<[f32; 3]> = points
        .iter()
        .map(|p| view.transform_point(p.map(|v| v as f32)))
        .collect();
    p.dedup_by(|a, b| (a[0] - b[0]).hypot(a[1] - b[1]) < 1e-7);
    if closed
        && p.len() > 1
        && (p[0][0] - p[p.len() - 1][0]).hypot(p[0][1] - p[p.len() - 1][1]) < 1e-7
    {
        p.pop();
    }
    let mut mesh = MeshData::default();
    if p.len() < 2 {
        return Ok(mesh);
    }
    let count = if closed { p.len() } else { p.len() - 1 };
    let half = width * 0.5;
    let mut normals = Vec::new();
    let mut lengths = Vec::new();
    for i in 0..count {
        let a = p[i];
        let b = p[(i + 1) % p.len()];
        let dx = b[0] - a[0];
        let dy = b[1] - a[1];
        let len = dx.hypot(dy);
        normals.push([-dy / len, dx / len]);
        lengths.push(len);
    }
    let offset = |p: [f32; 3], n: [f32; 2], s: f32| [p[0] + n[0] * s, p[1] + n[1] * s, p[2]];
    let mut starts: Vec<[[f32; 3]; 2]> = (0..count)
        .map(|i| {
            [
                offset(p[i], normals[i], half),
                offset(p[i], normals[i], -half),
            ]
        })
        .collect();
    let mut ends: Vec<[[f32; 3]; 2]> = (0..count)
        .map(|i| {
            [
                offset(p[(i + 1) % p.len()], normals[i], half),
                offset(p[(i + 1) % p.len()], normals[i], -half),
            ]
        })
        .collect();
    let add = |mesh: &mut MeshData, a: [f32; 3], b: [f32; 3], c: [f32; 3]| -> Result<(), String> {
        crate::interpreter::charge_execution_step()?;
        if mesh.vertices.len() + 3 > 65536 {
            return Err("stroke mesh exceeds 65536 vertices".into());
        }
        let base = mesh.vertices.len() as u32;
        for q in [a, b, c] {
            let world = std::array::from_fn(|i| {
                view.0[i * 4] * q[0]
                    + view.0[i * 4 + 1] * q[1]
                    + view.0[i * 4 + 2] * q[2]
                    + camera.position[i]
            });
            mesh.vertices.push(world);
            mesh.normals.push([view.0[2], view.0[6], view.0[10]]);
            mesh.uvs.push([0.0, 0.0]);
        }
        mesh.indices.extend([base, base + 1, base + 2]);
        Ok(())
    };
    for i in 0..p.len() {
        if !closed && (i == 0 || i == p.len() - 1) {
            continue;
        }
        let prev = (i + count - 1) % count;
        let next = i % count;
        let a = normals[prev];
        let b = normals[next];
        let turn = a[0] * b[1] - a[1] * b[0];
        let dot = a[0] * b[0] + a[1] * b[1];
        if dot > 0.99999 {
            let n = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5];
            for side in 0..2 {
                let q = offset(p[i], n, if side == 0 { half } else { -half });
                ends[prev][side] = q;
                starts[next][side] = q;
            }
            continue;
        }
        // Near reversals have no stable inner intersection; bounded by adjacent
        // segment lengths to keep short, acute corners from creating spikes.
        let inner = if turn >= 0.0 { 0 } else { 1 };
        let outer = 1 - inner;
        let sign = if inner == 0 { 1.0 } else { -1.0 };
        let factor = (half / (1.0 + dot).max(0.0001))
            .min(lengths[prev].min(lengths[next]) * 0.5 / ((1.0 - dot * dot).sqrt().max(0.0001)));
        let q = offset(p[i], [a[0] + b[0], a[1] + b[1]], factor * sign);
        ends[prev][inner] = q;
        starts[next][inner] = q;
        let from = ends[prev][outer];
        let to = starts[next][outer];
        if round_join {
            let start = (from[1] - p[i][1]).atan2(from[0] - p[i][0]);
            let sweep = turn.atan2(dot);
            let steps = ((sweep.abs() / std::f32::consts::PI * 16.0).ceil() as usize).max(1);
            let mut last = from;
            for j in 1..=steps {
                let angle = start + sweep * j as f32 / steps as f32;
                let next = if j == steps {
                    to
                } else {
                    offset(p[i], [angle.cos(), angle.sin()], half)
                };
                add(&mut mesh, q, last, next)?;
                last = next;
            }
        } else {
            add(&mut mesh, q, from, to)?;
        }
    }
    if !closed {
        for end in [false, true] {
            let seg = if end { count - 1 } else { 0 };
            let centre = if end { p[p.len() - 1] } else { p[0] };
            let n = normals[seg];
            let direction = [n[1], -n[0]];
            let sign = if end { 1.0 } else { -1.0 };
            if cap == "square" {
                let section = if end {
                    &mut ends[seg]
                } else {
                    &mut starts[seg]
                };
                for q in section {
                    *q = offset(*q, direction, half * sign);
                }
            }
            if cap == "round" {
                let mut last = offset(centre, n, half);
                for j in 1..=16 {
                    let angle = j as f32 * std::f32::consts::PI / 16.0;
                    let next = offset(
                        centre,
                        [
                            n[0] * angle.cos() + direction[0] * angle.sin() * sign,
                            n[1] * angle.cos() + direction[1] * angle.sin() * sign,
                        ],
                        half,
                    );
                    add(&mut mesh, centre, last, next)?;
                    last = next;
                }
            }
        }
    }
    for i in 0..count {
        let [a, b] = starts[i];
        let [c, d] = ends[i];
        add(&mut mesh, a, b, c)?;
        add(&mut mesh, b, d, c)?;
    }
    Ok(mesh)
}
pub fn world(
    c: &Call,
    scene: &mut crate::scene::Scene,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use crate::scene::*;
    if c.args.contains_key("gradient") {
        return Err("gradients are supported in 2d/overlay only".into());
    }
    if matches!(c.name.as_str(), "clear" | "background") {
        scene.gfx.clear = Some(if c.name == "clear" {
            Color::new(0.0, 0.0, 0.0, 0.0)
        } else {
            c.color("color", BLACK)?
        });
        return Ok(());
    }
    if matches!(c.name.as_str(), "text" | "image") {
        return Err(format!(
            "draw::{} needs gfx::overlay(enabled: true) in 3d",
            c.name
        ));
    }
    let projection = scene
        .camera
        .projection_matrix((width / height.max(1.0)) as f32)
        .mul(&scene.camera.view())
        .mul(&scene.top());
    let project = |p: [f64; 3]| {
        let q = projection.transform_point(p.map(|v| v as f32));
        [q[0] as f64 * width * 0.5, q[1] as f64 * height * 0.5]
    };
    let (mut points, closed, mut pivot) =
        path(c, if c.name == "polygon" { 2 } else { 3 }, &project)?;
    if c.name == "polygon" {
        let z = c.number("z", 0.0)?;
        pivot[2] = z;
        for p in &mut points {
            p[2] = z;
        }
    }
    let stroke = matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc")
        || c.boolean("stroke", false)?;
    let rotate = Mat4::rotation_z(c.angle("rotation_z_")? as f32)
        .mul(&Mat4::rotation_y(c.angle("rotation_y_")? as f32))
        .mul(&Mat4::rotation_x(c.angle("rotation_x_")? as f32))
        .mul(&Mat4::rotation_z(c.angle("rotation_")? as f32));
    let pivot = pivot.map(|v| v as f32);
    let matrix = scene
        .top()
        .mul(&Mat4::translation(pivot[0], pivot[1], pivot[2]))
        .mul(&rotate)
        .mul(&Mat4::translation(-pivot[0], -pivot[1], -pivot[2]));
    if c.name == "bezier" {
        let projection = scene
            .camera
            .projection_matrix((width / height.max(1.0)) as f32)
            .mul(&scene.camera.view())
            .mul(&matrix);
        let project = |p: [f64; 3]| {
            let q = projection.transform_point(p.map(|v| v as f32));
            [q[0] as f64 * width * 0.5, q[1] as f64 * height * 0.5]
        };
        points = path(c, 3, &project)?.0;
    }
    let (mesh, model) = if stroke {
        let w = c.number("stroke_width", 1.0)?;
        if w <= 0.0 {
            return Err("stroke_width must be positive".into());
        }
        let cap = c.text("line_cap", "butt")?;
        let join = c.text("line_join", "bevel")?;
        if !["butt", "round", "square"].contains(&cap.as_str())
            || !["bevel", "round"].contains(&join.as_str())
        {
            return Err("invalid line cap/join".into());
        }
        let transformed: Vec<_> = points
            .iter()
            .map(|p| {
                matrix
                    .transform_point(p.map(|v| v as f32))
                    .map(|v| v as f64)
            })
            .collect();
        (
            ribbon(
                &transformed,
                closed,
                w as f32,
                &scene.camera,
                join == "round",
                &cap,
            )?,
            Mat4::IDENTITY,
        )
    } else {
        (triangulate(&points)?, matrix)
    };
    if mesh.vertices.iter().flatten().any(|v| !v.is_finite()) {
        return Err("generated geometry exceeds finite coordinate range".into());
    }
    if mesh.vertices.is_empty() {
        return Ok(());
    }
    let existing: usize = scene.meshes.iter().map(|m| m.vertices.len()).sum();
    if existing + mesh.vertices.len() > 1_000_000 {
        return Err("generated mesh budget exceeded (1000000 vertices per frame)".into());
    }
    if scene.commands.len() >= MAX_DRAW_COMMANDS {
        return Err("draw command budget exceeded".into());
    }
    let id = scene.add_mesh(mesh)?;
    let texture = match c.args.get("texture") {
        Some(Value::Asset(a)) if a.kind.is_texture() => Some(scene.add_texture(&a.id)),
        None => None,
        _ => return Err("texture must be a bitmap/vector asset".into()),
    };
    let shading = match c
        .text("shading", if stroke { "unlit" } else { "default" })?
        .as_str()
    {
        "unlit" => Shading::Unlit,
        "flat" => Shading::Flat,
        "lambert" => Shading::Lambert,
        "default" => scene.default_shading(),
        _ => return Err("invalid shading".into()),
    };
    let color = c.color(
        if stroke && !matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc") {
            "stroke_color"
        } else {
            "color"
        },
        if stroke && !matches!(c.name.as_str(), "line" | "polyline" | "bezier" | "arc") {
            BLACK
        } else {
            WHITE
        },
    )?;
    let opacity = c.number("opacity", 1.0)?;
    if !(0.0..=1.0).contains(&opacity) {
        return Err("opacity must be 0..1".into());
    }
    scene.record(DrawCommand {
        key: BatchKey {
            primitive: Primitive::Mesh { id },
            texture,
            shading,
            wireframe: c.boolean("wireframe", false)?,
            blend: scene.gfx.blend,
            cull: scene.gfx.cull,
            depth_enabled: scene.gfx.depth_enabled,
            depth_write: scene.gfx.depth_write,
            overlay: false,
        },
        model,
        color,
        opacity: opacity as f32,
    });
    Ok(())
}
pub fn clear_images() {
    IMAGES.with(|cache| cache.borrow_mut().clear());
}
