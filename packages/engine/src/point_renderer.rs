//! Native GL_POINTS with bounded, AST-generated vertex programs.
use crate::{
    math3::Mat4,
    points::{PointCloud, DATA_WIDTH},
    scene::{Projection, Scene},
};
use std::collections::HashMap;
use std::rc::Rc;
use web_sys::{WebGl2RenderingContext as GL, WebGlProgram, WebGlTexture, WebGlVertexArrayObject};

const VERTEX: &str = r#"#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_data, u_model_data;
uniform int u_model_count;
float model_at(float index, int axis) {
    index = floor(index);
    if (isnan(index) || isinf(index) || index < 0.0 || index >= float(u_model_count)) return 0.0;
    int i = int(index);
    return texelFetch(u_model_data, ivec2(i % 1024, i / 1024), 0)[axis];
}
uniform mat4 u_model, u_view, u_projection;
uniform float u_size, u_scale;
uniform vec2 u_size_range;
out vec4 v_color;
float data_at(int index) { return texelFetch(u_data, ivec2(index % 1024, index / 1024), 0).r; }
float array_at(int offset, int count, float index) {
    index = floor(index);
    if (isnan(index) || isinf(index) || index < 0.0 || index >= float(count)) return 0.0;
    return data_at(offset + int(index));
}
float point_round(float v) { return sign(v)*floor(abs(v)+0.5); }
float point_cbrt(float v) { return sign(v)*pow(abs(v),1.0/3.0); }
vec3 point_hsl(vec3 hsl) {
    hsl.yz = clamp(hsl.yz, 0.0, 1.0);
    vec3 hue = clamp(abs(fract(hsl.x + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    return hsl.z + (hue - 0.5) * (1.0 - abs(2.0*hsl.z - 1.0)) * hsl.y;
}
/*CREATIVE_MATH*/
void main() {
/*FIELDS*/
    vec4 view_position = u_view * u_model * vec4(point_position, 1.0);
    gl_Position = u_projection * view_position;
    float size = point_size * (u_scale > 0.0 ? u_scale / max(-view_position.z, 0.000001) : 1.0);
    gl_PointSize = clamp(size, u_size_range.x, u_size_range.y);
    v_color = point_color;
    if (point_size <= 0.0 || isnan(point_size) || isinf(point_size) || any(isnan(gl_Position)) || any(isinf(gl_Position)) || any(isnan(point_color)) || any(isinf(point_color))) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        gl_PointSize = 1.0;
    }
}
"#;
const FRAGMENT: &str = r#"#version 300 es
precision highp float;
in vec4 v_color;
uniform bool u_premultiply, u_textured;
uniform sampler2D u_map;
uniform float u_alpha_test;
out vec4 out_color;
void main() {
    vec4 c = clamp(v_color, 0.0, 1.0);
    if (u_textured) c *= texture(u_map, gl_PointCoord);
    if (c.a <= 0.0 || c.a < u_alpha_test) discard;
    out_color = vec4(u_premultiply ? c.rgb*c.a : c.rgb, c.a);
}
"#;

pub struct PointRenderer {
    gl: GL,
    programs: HashMap<String, WebGlProgram>,
    vao: WebGlVertexArrayObject,
    texture: WebGlTexture,
    data: Vec<f32>,
    size_range: [f32; 2],
    models: HashMap<String, (Rc<Vec<[f32; 3]>>, WebGlTexture)>,
}
impl PointRenderer {
    pub fn new(gl: &GL) -> Result<Self, String> {
        let vao = gl
            .create_vertex_array()
            .ok_or("could not create point VAO")?;
        let Some(texture) = gl.create_texture() else {
            gl.delete_vertex_array(Some(&vao));
            return Err("could not create point data texture".into());
        };
        let range = gl
            .get_parameter(GL::ALIASED_POINT_SIZE_RANGE)
            .ok()
            .map(|v| js_sys::Float32Array::new(&v));
        let size_range = range
            .map(|v| [v.get_index(0), v.get_index(1)])
            .unwrap_or([1.0, 1.0]);
        Ok(Self {
            gl: gl.clone(),
            programs: HashMap::new(),
            vao,
            texture,
            data: Vec::new(),
            size_range,
            models: HashMap::new(),
        })
    }
    pub fn retain(&mut self, scene: &Scene) {
        self.models.retain(|id, (positions, texture)| {
            let used = scene.point_clouds.iter().any(|c| {
                c.model
                    .as_ref()
                    .is_some_and(|(key, data)| key == id && Rc::ptr_eq(data, positions))
            });
            if !used {
                self.gl.delete_texture(Some(texture));
            }
            used
        });
        self.programs.retain(|body, program| {
            let used = scene.point_clouds.iter().any(|c| &c.body == body);
            if !used {
                self.gl.delete_program(Some(program));
            }
            used
        });
    }
    pub fn draw(
        &mut self,
        cloud: &PointCloud,
        model: &Mat4,
        scene: &Scene,
        width: u32,
        height: u32,
        premultiplied: bool,
        sprite: Option<&WebGlTexture>,
    ) -> Result<(), String> {
        if cloud.count == 0 || cloud.size == 0.0 || (cloud.texture.is_some() && sprite.is_none()) {
            return Ok(());
        }
        let gl = &self.gl;
        if !self.programs.contains_key(&cloud.body) {
            let source = VERTEX.replace("/*FIELDS*/", &cloud.body).replace("/*CREATIVE_MATH*/", include_str!("creative_math.glsl"));
            let program = crate::renderer::link(gl, &source, FRAGMENT)
                .map_err(|e| format!("point cloud shader: {e}"))?;
            self.programs.insert(cloud.body.clone(), program);
        }
        if let Some((id, positions)) = &cloud.model {
            if !self.models.contains_key(id) {
                let texture = gl
                    .create_texture()
                    .ok_or("could not create model point texture")?;
                gl.active_texture(GL::TEXTURE1);
                gl.bind_texture(GL::TEXTURE_2D, Some(&texture));
                for param in [GL::TEXTURE_MIN_FILTER, GL::TEXTURE_MAG_FILTER] {
                    gl.tex_parameteri(GL::TEXTURE_2D, param, GL::NEAREST as i32);
                }
                for param in [GL::TEXTURE_WRAP_S, GL::TEXTURE_WRAP_T] {
                    gl.tex_parameteri(GL::TEXTURE_2D, param, GL::CLAMP_TO_EDGE as i32);
                }
                let rows = positions.len().div_ceil(DATA_WIDTH);
                let mut data = Vec::with_capacity(rows * DATA_WIDTH * 4);
                for p in positions.iter() {
                    data.extend_from_slice(&[p[0], p[1], p[2], 0.0]);
                }
                data.resize(rows * DATA_WIDTH * 4, 0.0);
                let result = unsafe {
                    let data = js_sys::Float32Array::view(&data);
                    gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_array_buffer_view(
                        GL::TEXTURE_2D, 0, GL::RGBA32F as i32, DATA_WIDTH as i32, rows as i32, 0,
                        GL::RGBA, GL::FLOAT, Some(&data))
                };
                if result.is_err() {
                    gl.delete_texture(Some(&texture));
                    return Err("could not upload model point data".into());
                }
                self.models.insert(id.clone(), (positions.clone(), texture));
            }
        }
        let program = &self.programs[&cloud.body];
        gl.use_program(Some(program));
        gl.bind_vertex_array(Some(&self.vao));
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.texture));
        for param in [GL::TEXTURE_MIN_FILTER, GL::TEXTURE_MAG_FILTER] {
            gl.tex_parameteri(GL::TEXTURE_2D, param, GL::NEAREST as i32);
        }
        for param in [GL::TEXTURE_WRAP_S, GL::TEXTURE_WRAP_T] {
            gl.tex_parameteri(GL::TEXTURE_2D, param, GL::CLAMP_TO_EDGE as i32);
        }
        let rows = cloud.data.len().max(1).div_ceil(DATA_WIDTH);
        self.data.clear();
        self.data.extend_from_slice(&cloud.data);
        self.data.resize(rows * DATA_WIDTH, 0.0);
        unsafe {
            let data = js_sys::Float32Array::view(&self.data);
            gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_array_buffer_view(
                GL::TEXTURE_2D,
                0,
                GL::R32F as i32,
                DATA_WIDTH as i32,
                rows as i32,
                0,
                GL::RED,
                GL::FLOAT,
                Some(&data),
            )
            .map_err(|_| "could not upload point field data")?;
        }
        let loc = |name| gl.get_uniform_location(program, name);
        gl.uniform1i(loc("u_data").as_ref(), 0);
        gl.uniform1i(loc("u_premultiply").as_ref(), i32::from(premultiplied));
        let model_texture = cloud
            .model
            .as_ref()
            .and_then(|(id, _)| self.models.get(id))
            .map(|(_, t)| t);
        gl.active_texture(GL::TEXTURE1);
        gl.bind_texture(GL::TEXTURE_2D, Some(model_texture.unwrap_or(&self.texture)));
        gl.uniform1i(loc("u_model_data").as_ref(), 1);
        gl.uniform1i(
            loc("u_model_count").as_ref(),
            cloud
                .model
                .as_ref()
                .map(|(_, p)| p.len() as i32)
                .unwrap_or(0),
        );
        gl.active_texture(GL::TEXTURE2);
        gl.bind_texture(GL::TEXTURE_2D, Some(sprite.unwrap_or(&self.texture)));
        gl.uniform1i(loc("u_map").as_ref(), 2);
        gl.uniform1i(loc("u_textured").as_ref(), i32::from(sprite.is_some()));
        gl.uniform1f(loc("u_alpha_test").as_ref(), cloud.alpha_test);
        gl.uniform1f(loc("u_size").as_ref(), cloud.size);
        let scale = if cloud.attenuation
            && matches!(scene.camera.projection, Projection::Perspective { .. })
        {
            height as f32 * 0.5
        } else {
            0.0
        };
        gl.uniform1f(loc("u_scale").as_ref(), scale);
        gl.uniform2f(
            loc("u_size_range").as_ref(),
            self.size_range[0],
            self.size_range[1],
        );
        let aspect = width as f32 / height.max(1) as f32;
        for (name, matrix) in [
            ("u_model", *model),
            ("u_view", scene.camera.view()),
            ("u_projection", scene.camera.projection_matrix(aspect)),
        ] {
            gl.uniform_matrix4fv_with_f32_array(loc(name).as_ref(), false, matrix.as_slice());
        }
        if let Some((columns, rows)) = cloud.grid {
            gl.draw_arrays(GL::TRIANGLES, 0, ((columns - 1) * (rows - 1) * 6) as i32);
        } else {
            gl.draw_arrays(GL::POINTS, 0, cloud.count as i32);
        }
        gl.bind_vertex_array(None);
        gl.active_texture(GL::TEXTURE0);
        Ok(())
    }
}
impl Drop for PointRenderer {
    fn drop(&mut self) {
        for program in self.programs.values() {
            self.gl.delete_program(Some(program));
        }
        for (_, texture) in self.models.values() {
            self.gl.delete_texture(Some(texture));
        }
        self.gl.delete_texture(Some(&self.texture));
        self.gl.delete_vertex_array(Some(&self.vao));
    }
}
