//! GPU-only frame composition and scramble, shared by Canvas2D and 3D.
use crate::scramble::{narrow_source_map, refresh_steps, Scramble, PRESETS};
use std::collections::HashMap;
use web_sys::{
    HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlFramebuffer, WebGlProgram,
    WebGlRenderbuffer, WebGlTexture, WebGlUniformLocation,
};

const VERTEX: &str = "#version 300 es\nvoid main() {\n vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);\n gl_Position = vec4(p * 2.0 - 1.0, 0, 1);\n}";

struct Target {
    gl: GL,
    texture: WebGlTexture,
    framebuffer: WebGlFramebuffer,
    depth: Option<WebGlRenderbuffer>,
}

impl Target {
    fn new(gl: &GL, width: u32, height: u32, depth: bool) -> Result<Self, String> {
        let texture = gl
            .create_texture()
            .ok_or("could not create feedback texture")?;
        let Some(framebuffer) = gl.create_framebuffer() else {
            gl.delete_texture(Some(&texture));
            return Err("could not create feedback framebuffer".into());
        };
        let mut target = Self {
            gl: gl.clone(),
            texture,
            framebuffer,
            depth: None,
        };
        gl.bind_texture(GL::TEXTURE_2D, Some(&target.texture));
        texture_parameters(gl);
        gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
            GL::TEXTURE_2D,
            0,
            GL::RGBA8 as i32,
            width as i32,
            height as i32,
            0,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            None,
        )
        .map_err(|_| "could not allocate feedback texture")?;
        gl.bind_framebuffer(GL::FRAMEBUFFER, Some(&target.framebuffer));
        gl.framebuffer_texture_2d(
            GL::FRAMEBUFFER,
            GL::COLOR_ATTACHMENT0,
            GL::TEXTURE_2D,
            Some(&target.texture),
            0,
        );
        if depth {
            let buffer = gl
                .create_renderbuffer()
                .ok_or("could not create scene depth buffer")?;
            target.depth = Some(buffer.clone());
            gl.bind_renderbuffer(GL::RENDERBUFFER, Some(&buffer));
            gl.renderbuffer_storage(
                GL::RENDERBUFFER,
                GL::DEPTH_COMPONENT24,
                width as i32,
                height as i32,
            );
            gl.framebuffer_renderbuffer(
                GL::FRAMEBUFFER,
                GL::DEPTH_ATTACHMENT,
                GL::RENDERBUFFER,
                Some(&buffer),
            );
        }
        if gl.check_framebuffer_status(GL::FRAMEBUFFER) != GL::FRAMEBUFFER_COMPLETE {
            return Err("incomplete scramble framebuffer".into());
        }
        gl.color_mask(true, true, true, true);
        gl.disable(GL::SCISSOR_TEST);
        gl.clear_color(0.0, 0.0, 0.0, 0.0);
        gl.clear(GL::COLOR_BUFFER_BIT);
        gl.bind_framebuffer(GL::FRAMEBUFFER, None);
        Ok(target)
    }
}

impl Drop for Target {
    fn drop(&mut self) {
        self.gl.delete_framebuffer(Some(&self.framebuffer));
        self.gl.delete_texture(Some(&self.texture));
        self.gl.delete_renderbuffer(self.depth.as_ref());
    }
}

fn texture_parameters(gl: &GL) {
    for name in [GL::TEXTURE_MIN_FILTER, GL::TEXTURE_MAG_FILTER] {
        gl.tex_parameteri(GL::TEXTURE_2D, name, GL::NEAREST as i32);
    }
    for name in [GL::TEXTURE_WRAP_S, GL::TEXTURE_WRAP_T] {
        gl.tex_parameteri(GL::TEXTURE_2D, name, GL::CLAMP_TO_EDGE as i32);
    }
}

struct Buffers {
    scene: Target,
    composite: Target,
    history: [Target; 2],
    width: u32,
    height: u32,
    read: usize,
}

pub struct Feedback {
    gl: GL,
    program: WebGlProgram,
    uniforms: HashMap<&'static str, Option<WebGlUniformLocation>>,
    buffers: Option<Buffers>,
    map: WebGlTexture,
    map_key: Option<(u32, u32, u8)>,
    active: bool,
    refresh_remainder: f64,
}

impl Feedback {
    pub fn new(gl: GL) -> Result<Self, String> {
        let program = crate::renderer::link(&gl, VERTEX, include_str!("scramble.frag"))?;
        let Some(map) = gl.create_texture() else {
            gl.delete_program(Some(&program));
            return Err("could not create scramble address texture".into());
        };
        let names = [
            "u_source",
            "u_history",
            "u_map",
            "u_size",
            "u_offsets",
            "u_exclude",
            "u_kind",
            "u_pass",
            "u_refresh",
            "u_refresh_steps",
        ];
        let uniforms = names
            .into_iter()
            .map(|n| (n, gl.get_uniform_location(&program, n)))
            .collect();
        // A complete integer texture must be bound even when the shader's map
        // branch is not taken. Never alias a float and integer sampler unit.
        gl.bind_texture(GL::TEXTURE_2D, Some(&map));
        texture_parameters(&gl);
        gl.tex_storage_2d(GL::TEXTURE_2D, 1, GL::RGBA32I, 1, 1);
        Ok(Self {
            gl,
            program,
            uniforms,
            buffers: None,
            map,
            map_key: None,
            active: false,
            refresh_remainder: 0.0,
        })
    }

    pub fn reset(&mut self) {
        self.buffers = None;
        self.map_key = None;
        self.active = false;
        self.refresh_remainder = 0.0;
    }

    pub fn prepare(&mut self, width: u32, height: u32) -> Result<(), String> {
        if self
            .buffers
            .as_ref()
            .is_some_and(|b| b.width == width && b.height == height)
        {
            return Ok(());
        }
        self.reset();
        let max = self
            .gl
            .get_parameter(GL::MAX_TEXTURE_SIZE)
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if width == 0 || height == 0 || width as f64 > max || height as f64 > max {
            return Err("scramble size exceeds GPU texture limits".into());
        }
        self.gl.active_texture(GL::TEXTURE0);
        self.buffers = Some(Buffers {
            scene: Target::new(&self.gl, width, height, true)?,
            composite: Target::new(&self.gl, width, height, false)?,
            history: [
                Target::new(&self.gl, width, height, false)?,
                Target::new(&self.gl, width, height, false)?,
            ],
            width,
            height,
            read: 0,
        });
        Ok(())
    }

    /// Bind a fresh-depth scene destination before the 3D renderer draws.
    pub fn bind_scene(&self) {
        let b = self.buffers.as_ref().expect("feedback prepared");
        self.gl
            .bind_framebuffer(GL::FRAMEBUFFER, Some(&b.scene.framebuffer));
    }

    /// Browser canvas-to-texture transfer: no CPU pixel extraction or round trip.
    pub fn upload_canvas(&self, canvas: &HtmlCanvasElement) -> Result<(), String> {
        let b = self.buffers.as_ref().expect("feedback prepared");
        let gl = &self.gl;
        gl.bind_framebuffer(GL::FRAMEBUFFER, None);
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(&b.scene.texture));
        gl.pixel_storei(GL::UNPACK_FLIP_Y_WEBGL, 1);
        gl.pixel_storei(GL::UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
        gl.pixel_storei(GL::UNPACK_COLORSPACE_CONVERSION_WEBGL, GL::NONE as i32);
        let result = gl
            .tex_sub_image_2d_with_u32_and_u32_and_html_canvas_element(
                GL::TEXTURE_2D,
                0,
                0,
                0,
                GL::RGBA,
                GL::UNSIGNED_BYTE,
                canvas,
            )
            .map_err(|_| "could not transfer 2D scene to scramble texture".into());
        gl.pixel_storei(GL::UNPACK_FLIP_Y_WEBGL, 0);
        gl.pixel_storei(GL::UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.pixel_storei(
            GL::UNPACK_COLORSPACE_CONVERSION_WEBGL,
            GL::BROWSER_DEFAULT_WEBGL as i32,
        );
        result
    }

    fn loc(&self, name: &str) -> Option<&WebGlUniformLocation> {
        self.uniforms[name].as_ref()
    }

    fn draw(&self, pass: i32, source: &WebGlTexture, destination: Option<&WebGlFramebuffer>) {
        let gl = &self.gl;
        gl.bind_framebuffer(GL::FRAMEBUFFER, destination);
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(source));
        gl.uniform1i(self.loc("u_pass"), pass);
        gl.draw_arrays(GL::TRIANGLES, 0, 3);
    }

    pub fn finish(&mut self, effect: Option<Scramble>, seconds: f64) -> Result<(), String> {
        let gl = &self.gl;
        let b = self.buffers.as_ref().expect("feedback prepared");
        if let Some(effect) = effect.filter(|e| b.width < 27 && e.kind <= 17) {
            let key = (b.width, b.height, effect.kind);
            if self.map_key != Some(key) {
                let addresses = narrow_source_map(b.width, b.height, effect.kind);
                // Recreate: the initial dummy texture has immutable storage.
                let map = gl
                    .create_texture()
                    .ok_or("could not create scramble address texture")?;
                gl.delete_texture(Some(&self.map));
                self.map = map;
                gl.active_texture(GL::TEXTURE2);
                gl.bind_texture(GL::TEXTURE_2D, Some(&self.map));
                texture_parameters(gl);
                gl.tex_storage_2d(
                    GL::TEXTURE_2D,
                    1,
                    GL::RGBA32I,
                    b.width as i32,
                    b.height as i32,
                );
                unsafe {
                    let view = js_sys::Int32Array::view(&addresses);
                    gl.tex_sub_image_2d_with_i32_and_i32_and_u32_and_type_and_opt_array_buffer_view(
                        GL::TEXTURE_2D, 0, 0, 0, b.width as i32, b.height as i32,
                        GL::RGBA_INTEGER, GL::INT, Some(&view),
                    ).map_err(|_| "could not upload scramble address map")?;
                }
                self.map_key = Some(key);
            }
        }
        gl.use_program(Some(&self.program));
        gl.bind_vertex_array(None);
        gl.disable(GL::DEPTH_TEST);
        gl.disable(GL::CULL_FACE);
        gl.disable(GL::BLEND);
        gl.disable(GL::SCISSOR_TEST);
        gl.disable(GL::DITHER);
        gl.color_mask(true, true, true, true);
        gl.viewport(0, 0, b.width as i32, b.height as i32);
        gl.uniform2i(self.loc("u_size"), b.width as i32, b.height as i32);
        gl.uniform1i(self.loc("u_source"), 0);
        gl.uniform1i(self.loc("u_history"), 1);
        gl.uniform1i(self.loc("u_map"), 2);
        gl.active_texture(GL::TEXTURE2);
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.map));
        gl.active_texture(GL::TEXTURE1);
        gl.bind_texture(GL::TEXTURE_2D, Some(&b.history[b.read].texture));
        if let Some(effect) = effect {
            if !self.active {
                for history in &b.history {
                    gl.bind_framebuffer(GL::FRAMEBUFFER, Some(&history.framebuffer));
                    gl.clear_color(0.0, 0.0, 0.0, 0.0);
                    gl.clear(GL::COLOR_BUFFER_BIT);
                }
            }
            let ticks = if self.active {
                refresh_steps(&mut self.refresh_remainder, seconds)
            } else {
                self.refresh_remainder = 0.0;
                1
            };
            gl.uniform1i(self.loc("u_refresh_steps"), ticks as i32);
            let c = effect.refresh;
            gl.uniform4f(
                self.loc("u_refresh"),
                c.r as f32,
                c.g as f32,
                c.b as f32,
                c.a as f32,
            );
            gl.uniform1i(self.loc("u_kind"), effect.kind as i32);
            if effect.kind <= 17 {
                let p = PRESETS[effect.kind as usize - 1];
                gl.uniform4i(self.loc("u_offsets"), p[0], p[1], p[2], p[3]);
                gl.uniform1i(self.loc("u_exclude"), p[4]);
            }
            self.draw(0, &b.scene.texture, Some(&b.composite.framebuffer));
            let output = &b.history[1 - b.read];
            self.draw(1, &b.composite.texture, Some(&output.framebuffer));
            self.draw(2, &output.texture, None);
            self.buffers.as_mut().unwrap().read = 1 - b.read;
            self.active = true;
        } else {
            self.draw(3, &b.scene.texture, None);
            self.active = false;
        }
        // Do not leak sampler or framebuffer bindings into the scene renderer.
        for unit in [GL::TEXTURE2, GL::TEXTURE1, GL::TEXTURE0] {
            gl.active_texture(unit);
            gl.bind_texture(GL::TEXTURE_2D, None);
        }
        Ok(())
    }
}

impl Drop for Feedback {
    fn drop(&mut self) {
        self.gl.delete_program(Some(&self.program));
        self.gl.delete_texture(Some(&self.map));
    }
}
