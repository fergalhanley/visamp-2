//! WebGL2 renderer: turns a [`Scene`]'s command buffer into draw calls.
//!
//! Geometry is uploaded once per primitive and reused for every instance, with
//! position, rotation, scale and colour supplied per instance. A `for` loop
//! issuing one `draw::cube` per iteration therefore costs one draw call however
//! many bars it draws, which is what §9.2 asks for.

use std::collections::HashMap;

use web_sys::{WebGl2RenderingContext as GL, WebGlBuffer, WebGlProgram, WebGlVertexArrayObject};

use crate::geometry;
use crate::scene::{Batch, BlendMode, CullMode, Primitive, Scene, Shading};

/// Attribute slots. The model matrix takes four consecutive ones, since a
/// vertex attribute is at most a vec4.
const A_POSITION: u32 = 0;
const A_NORMAL: u32 = 1;
const A_MODEL: u32 = 2;
const A_COLOR: u32 = 6;

/// Floats per instance: a 4x4 model matrix plus an RGBA colour.
const INSTANCE_FLOATS: usize = 20;

const VERTEX_SHADER: &str = r#"#version 300 es
in vec3 a_position;
in vec3 a_normal;
in mat4 a_model;
in vec4 a_color;

uniform mat4 u_view_projection;

// Set for sprites, which face the camera whatever it is doing.
uniform int u_billboard;
uniform vec3 u_camera_right;
uniform vec3 u_camera_up;

out vec3 v_normal;
out vec3 v_world;
out vec4 v_color;

void main() {
    vec4 world;

    if (u_billboard == 1) {
        // Rebuild the quad in the camera's plane, keeping the instance's
        // translation and its width and height. Rotating it any other way is
        // the whole point of a sprite being a sprite.
        vec3 centre = a_model[3].xyz;
        float width = length(a_model[0].xyz);
        float height = length(a_model[1].xyz);
        world = vec4(
            centre
                + u_camera_right * a_position.x * width
                + u_camera_up * a_position.y * height,
            1.0
        );
        v_normal = normalize(cross(u_camera_right, u_camera_up));
    } else {
        world = a_model * vec4(a_position, 1.0);
        // Inverse-transpose, so a non-uniformly scaled shape still lights as
        // if its faces pointed outward. A squashed cube would shade wrong.
        v_normal = normalize(transpose(inverse(mat3(a_model))) * a_normal);
    }

    v_world = world.xyz;
    v_color = a_color;

    gl_Position = u_view_projection * world;
}
"#;

const FRAGMENT_SHADER: &str = r#"#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_world;
in vec4 v_color;

uniform int u_lit;
uniform vec3 u_ambient;

uniform int u_dir_count;
uniform vec3 u_dir_direction[8];
uniform vec3 u_dir_color[8];

uniform int u_point_count;
uniform vec3 u_point_position[16];
uniform vec3 u_point_color[16];
uniform float u_point_range[16];

out vec4 frag_color;

void main() {
    if (u_lit == 0) {
        frag_color = v_color;
        return;
    }

    vec3 normal = normalize(v_normal);
    vec3 light = u_ambient;

    for (int i = 0; i < 8; i++) {
        if (i >= u_dir_count) break;
        vec3 to_light = -normalize(u_dir_direction[i]);
        light += u_dir_color[i] * max(dot(normal, to_light), 0.0);
    }

    for (int i = 0; i < 16; i++) {
        if (i >= u_point_count) break;
        vec3 offset = u_point_position[i] - v_world;
        float distance = length(offset);
        // Linear falloff squared: cheap, and reaches exactly zero at the range
        // rather than trailing off forever.
        float attenuation = max(0.0, 1.0 - distance / max(u_point_range[i], 0.0001));
        light += u_point_color[i]
            * max(dot(normal, normalize(offset)), 0.0)
            * attenuation * attenuation;
    }

    frag_color = vec4(v_color.rgb * light, v_color.a);
}
"#;

struct Mesh {
    vao: WebGlVertexArrayObject,
    /// Triangle indices, and the line-segment indices used for wireframe.
    /// Two buffers rather than one: wireframe is not a draw mode over the same
    /// indices, it needs its own list of edges.
    triangles: WebGlBuffer,
    edges: WebGlBuffer,
    triangle_count: i32,
    edge_count: i32,
}

pub struct Renderer {
    gl: GL,
    program: WebGlProgram,
    instances: WebGlBuffer,
    meshes: HashMap<Primitive, Mesh>,
    scratch: Vec<f32>,
}

impl Renderer {
    pub fn new(gl: GL) -> Result<Self, String> {
        let program = link(&gl, VERTEX_SHADER, FRAGMENT_SHADER)?;
        let instances = gl.create_buffer().ok_or("could not create instance buffer")?;

        Ok(Renderer {
            gl,
            program,
            instances,
            meshes: HashMap::new(),
            scratch: Vec::new(),
        })
    }

    pub fn render(&mut self, scene: &Scene, width: u32, height: u32) -> Result<(), String> {
        let gl = self.gl.clone();
        gl.viewport(0, 0, width as i32, height as i32);

        match scene.gfx.clear {
            Some(c) => gl.clear_color(c.r as f32, c.g as f32, c.b as f32, c.a as f32),
            None => gl.clear_color(0.0, 0.0, 0.0, 0.0),
        }
        gl.clear_depth(1.0);
        gl.depth_func(GL::LEQUAL);
        gl.clear(GL::COLOR_BUFFER_BIT | GL::DEPTH_BUFFER_BIT);

        let aspect = if height == 0 { 1.0 } else { width as f32 / height as f32 };
        let view_projection = scene
            .camera
            .projection_matrix(aspect)
            .mul(&scene.camera.view());

        gl.use_program(Some(&self.program));
        self.set_view_projection(view_projection.as_slice());
        self.set_lights(scene);

        // The view matrix's rows are the camera's world-space axes, which is
        // what a billboard needs to orient itself.
        let view = scene.camera.view();
        let v = view.as_slice();
        self.set_vec3("u_camera_right", [v[0], v[4], v[8]]);
        self.set_vec3("u_camera_up", [v[1], v[5], v[9]]);

        for batch in scene.batches() {
            self.draw(scene, &batch)?;
        }

        // Meshes are rebuilt every frame: a `Primitive::Mesh` id is only
        // meaningful within the frame that recorded it, so caching one across
        // frames would draw last frame's geometry.
        self.meshes.retain(|primitive, _| !matches!(primitive, Primitive::Mesh { .. }));

        Ok(())
    }

    fn draw(&mut self, scene: &Scene, batch: &Batch) -> Result<(), String> {
        let gl = self.gl.clone();
        self.ensure_mesh(batch.key.primitive, scene)?;

        let Some(mesh) = self.meshes.get(&batch.key.primitive) else {
            return Ok(());
        };
        let triangle_count = mesh.triangle_count;
        let edge_count = mesh.edge_count;
        let vao = mesh.vao.clone();
        let elements = if batch.key.wireframe {
            mesh.edges.clone()
        } else {
            mesh.triangles.clone()
        };

        // Render state for this batch.
        if batch.key.depth_enabled {
            gl.enable(GL::DEPTH_TEST);
        } else {
            gl.disable(GL::DEPTH_TEST);
        }
        gl.depth_mask(batch.key.depth_write);

        match batch.key.cull {
            CullMode::None => gl.disable(GL::CULL_FACE),
            CullMode::Back => {
                gl.enable(GL::CULL_FACE);
                gl.cull_face(GL::BACK);
            }
            CullMode::Front => {
                gl.enable(GL::CULL_FACE);
                gl.cull_face(GL::FRONT);
            }
        }

        match batch.key.blend {
            BlendMode::None => gl.disable(GL::BLEND),
            BlendMode::Alpha => {
                gl.enable(GL::BLEND);
                gl.blend_func(GL::SRC_ALPHA, GL::ONE_MINUS_SRC_ALPHA);
            }
            BlendMode::Additive => {
                gl.enable(GL::BLEND);
                gl.blend_func(GL::SRC_ALPHA, GL::ONE);
            }
            BlendMode::Multiply => {
                gl.enable(GL::BLEND);
                gl.blend_func(GL::DST_COLOR, GL::ZERO);
            }
        }

        // `flat` is treated as `lambert` for now: distinguishing them needs a
        // second program compiled with a flat-interpolated normal, and getting
        // it wrong silently would be worse than shading a little too smoothly.
        let lit = i32::from(batch.key.shading != Shading::Unlit);
        self.set_int("u_lit", lit);
        self.set_int(
            "u_billboard",
            i32::from(batch.key.primitive == Primitive::Sprite),
        );

        // One float run per instance, uploaded in a single call.
        self.scratch.clear();
        self.scratch.reserve(batch.instances.len() * INSTANCE_FLOATS);
        for command in &batch.instances {
            self.scratch.extend_from_slice(command.model.as_slice());
            self.scratch.push(command.color.r as f32);
            self.scratch.push(command.color.g as f32);
            self.scratch.push(command.color.b as f32);
            self.scratch.push(command.color.a as f32 * command.opacity);
        }

        gl.bind_vertex_array(Some(&vao));
        // The element binding lives in the VAO, so it has to be set for the
        // mode being drawn rather than once at upload time.
        gl.bind_buffer(GL::ELEMENT_ARRAY_BUFFER, Some(&elements));
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.instances));
        unsafe {
            let view = js_sys::Float32Array::view(&self.scratch);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::DYNAMIC_DRAW);
        }

        let count = batch.instances.len() as i32;
        if batch.key.wireframe {
            gl.draw_elements_instanced_with_i32(GL::LINES, edge_count, GL::UNSIGNED_INT, 0, count);
        } else {
            gl.draw_elements_instanced_with_i32(
                GL::TRIANGLES,
                triangle_count,
                GL::UNSIGNED_INT,
                0,
                count,
            );
        }

        gl.bind_vertex_array(None);
        Ok(())
    }

    /// Uploads a primitive's geometry the first time it is drawn.
    fn ensure_mesh(&mut self, primitive: Primitive, scene: &Scene) -> Result<(), String> {
        if self.meshes.contains_key(&primitive) {
            return Ok(());
        }

        let gl = &self.gl;
        let geometry = geometry::build(primitive, &scene.meshes);
        if geometry.indices.is_empty() {
            return Ok(());
        }

        let vao = gl.create_vertex_array().ok_or("could not create VAO")?;
        gl.bind_vertex_array(Some(&vao));

        // Vertices: position and normal, interleaved.
        let vertices = gl.create_buffer().ok_or("could not create vertex buffer")?;
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&vertices));
        unsafe {
            let view = js_sys::Float32Array::view(&geometry.vertices);
            gl.buffer_data_with_array_buffer_view(GL::ARRAY_BUFFER, &view, GL::STATIC_DRAW);
        }

        let stride = 6 * 4;
        gl.enable_vertex_attrib_array(A_POSITION);
        gl.vertex_attrib_pointer_with_i32(A_POSITION, 3, GL::FLOAT, false, stride, 0);
        gl.enable_vertex_attrib_array(A_NORMAL);
        gl.vertex_attrib_pointer_with_i32(A_NORMAL, 3, GL::FLOAT, false, stride, 3 * 4);

        // Triangle indices, and a second buffer of edges for wireframe.
        let triangles = gl.create_buffer().ok_or("could not create index buffer")?;
        gl.bind_buffer(GL::ELEMENT_ARRAY_BUFFER, Some(&triangles));
        unsafe {
            let view = js_sys::Uint32Array::view(&geometry.indices);
            gl.buffer_data_with_array_buffer_view(
                GL::ELEMENT_ARRAY_BUFFER,
                &view,
                GL::STATIC_DRAW,
            );
        }

        let edge_indices = geometry.edges();
        let edges = gl.create_buffer().ok_or("could not create edge buffer")?;
        gl.bind_buffer(GL::ELEMENT_ARRAY_BUFFER, Some(&edges));
        unsafe {
            let view = js_sys::Uint32Array::view(&edge_indices);
            gl.buffer_data_with_array_buffer_view(
                GL::ELEMENT_ARRAY_BUFFER,
                &view,
                GL::STATIC_DRAW,
            );
        }

        // Per-instance attributes come from the shared instance buffer.
        gl.bind_buffer(GL::ARRAY_BUFFER, Some(&self.instances));
        let instance_stride = (INSTANCE_FLOATS * 4) as i32;
        for column in 0..4u32 {
            let slot = A_MODEL + column;
            gl.enable_vertex_attrib_array(slot);
            gl.vertex_attrib_pointer_with_i32(
                slot,
                4,
                GL::FLOAT,
                false,
                instance_stride,
                (column * 16) as i32,
            );
            gl.vertex_attrib_divisor(slot, 1);
        }
        gl.enable_vertex_attrib_array(A_COLOR);
        gl.vertex_attrib_pointer_with_i32(A_COLOR, 4, GL::FLOAT, false, instance_stride, 64);
        gl.vertex_attrib_divisor(A_COLOR, 1);

        gl.bind_vertex_array(None);

        self.meshes.insert(
            primitive,
            Mesh {
                vao,
                triangles,
                edges,
                triangle_count: geometry.indices.len() as i32,
                edge_count: edge_indices.len() as i32,
            },
        );

        Ok(())
    }

    fn set_view_projection(&self, matrix: &[f32; 16]) {
        if let Some(location) = self.gl.get_uniform_location(&self.program, "u_view_projection") {
            self.gl
                .uniform_matrix4fv_with_f32_array(Some(&location), false, matrix);
        }
    }

    fn set_int(&self, name: &str, value: i32) {
        if let Some(location) = self.gl.get_uniform_location(&self.program, name) {
            self.gl.uniform1i(Some(&location), value);
        }
    }

    fn set_vec3(&self, name: &str, value: [f32; 3]) {
        if let Some(location) = self.gl.get_uniform_location(&self.program, name) {
            self.gl
                .uniform3f(Some(&location), value[0], value[1], value[2]);
        }
    }

    fn set_vec3_array(&self, name: &str, values: &[f32]) {
        if let Some(location) = self.gl.get_uniform_location(&self.program, name) {
            self.gl.uniform3fv_with_f32_array(Some(&location), values);
        }
    }

    fn set_lights(&self, scene: &Scene) {
        let ambient = scene.lights.ambient.unwrap_or(crate::model::BLACK);
        if let Some(location) = self.gl.get_uniform_location(&self.program, "u_ambient") {
            self.gl.uniform3f(
                Some(&location),
                ambient.r as f32,
                ambient.g as f32,
                ambient.b as f32,
            );
        }

        let mut directions = Vec::new();
        let mut colors = Vec::new();
        for light in &scene.lights.directional {
            directions.extend_from_slice(&light.direction);
            colors.extend_from_slice(&[
                light.color.r as f32 * light.intensity,
                light.color.g as f32 * light.intensity,
                light.color.b as f32 * light.intensity,
            ]);
        }
        self.set_int("u_dir_count", scene.lights.directional.len() as i32);
        if !directions.is_empty() {
            self.set_vec3_array("u_dir_direction", &directions);
            self.set_vec3_array("u_dir_color", &colors);
        }

        let mut positions = Vec::new();
        let mut point_colors = Vec::new();
        let mut ranges = Vec::new();
        for light in &scene.lights.point {
            positions.extend_from_slice(&light.position);
            point_colors.extend_from_slice(&[
                light.color.r as f32 * light.intensity,
                light.color.g as f32 * light.intensity,
                light.color.b as f32 * light.intensity,
            ]);
            ranges.push(light.range);
        }
        self.set_int("u_point_count", scene.lights.point.len() as i32);
        if !positions.is_empty() {
            self.set_vec3_array("u_point_position", &positions);
            self.set_vec3_array("u_point_color", &point_colors);
            if let Some(location) = self.gl.get_uniform_location(&self.program, "u_point_range") {
                self.gl.uniform1fv_with_f32_array(Some(&location), &ranges);
            }
        }
    }
}

fn link(gl: &GL, vertex: &str, fragment: &str) -> Result<WebGlProgram, String> {
    let vs = compile(gl, GL::VERTEX_SHADER, vertex)?;
    let fs = compile(gl, GL::FRAGMENT_SHADER, fragment)?;

    let program = gl.create_program().ok_or("could not create program")?;
    gl.attach_shader(&program, &vs);
    gl.attach_shader(&program, &fs);

    // Bound before linking so the attribute slots are known rather than
    // whatever the driver happened to assign.
    gl.bind_attrib_location(&program, A_POSITION, "a_position");
    gl.bind_attrib_location(&program, A_NORMAL, "a_normal");
    gl.bind_attrib_location(&program, A_MODEL, "a_model");
    gl.bind_attrib_location(&program, A_COLOR, "a_color");

    gl.link_program(&program);

    if gl
        .get_program_parameter(&program, GL::LINK_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(program)
    } else {
        Err(gl
            .get_program_info_log(&program)
            .unwrap_or_else(|| "unknown link error".to_string()))
    }
}

fn compile(gl: &GL, kind: u32, source: &str) -> Result<web_sys::WebGlShader, String> {
    let shader = gl.create_shader(kind).ok_or("could not create shader")?;
    gl.shader_source(&shader, source);
    gl.compile_shader(&shader);

    if gl
        .get_shader_parameter(&shader, GL::COMPILE_STATUS)
        .as_bool()
        .unwrap_or(false)
    {
        Ok(shader)
    } else {
        Err(gl
            .get_shader_info_log(&shader)
            .unwrap_or_else(|| "unknown shader error".to_string()))
    }
}
