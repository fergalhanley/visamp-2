//! A final Canvas2D overlay, uploaded once and composited in the render target.
use crate::drawing::{Call, CanvasState};
use std::cell::RefCell;
use wasm_bindgen::JsCast;
use web_sys::{
    CanvasRenderingContext2d, HtmlCanvasElement, WebGl2RenderingContext as GL, WebGlProgram,
    WebGlTexture,
};
pub struct Overlay {
    gl: GL,
    canvas: HtmlCanvasElement,
    ctx: CanvasRenderingContext2d,
    program: WebGlProgram,
    texture: WebGlTexture,
}
impl Overlay {
    pub fn new(gl: &GL) -> Result<Self, String> {
        let canvas = web_sys::window()
            .and_then(|w| w.document())
            .ok_or("overlay needs a document")?
            .create_element("canvas")
            .map_err(|_| "overlay canvas creation failed")?
            .dyn_into::<HtmlCanvasElement>()
            .map_err(|_| "invalid canvas")?;
        let ctx = canvas
            .get_context("2d")
            .map_err(|_| "overlay context failed")?
            .ok_or("overlay context missing")?
            .dyn_into::<CanvasRenderingContext2d>()
            .map_err(|_| "invalid overlay context")?;
        let program = crate::renderer::link(
            gl,
            r#"#version 300 es
  out vec2 uv;
  void main(){vec2 p=vec2(float((gl_VertexID << 1) & 2),float(gl_VertexID & 2)); uv=vec2(p.x,1.0-p.y);gl_Position=vec4(p*2.0-1.0,0.0,1.0);}"#,
            r#"#version 300 es
  precision highp float;
  in vec2 uv;uniform sampler2D source;uniform int premultiply;out vec4 color;
  void main(){color=texture(source,uv);if(premultiply==1)color.rgb*=color.a;}"#,
        )?;
        let texture = gl
            .create_texture()
            .ok_or("overlay texture allocation failed")?;
        Ok(Self {
            gl: gl.clone(),
            canvas,
            ctx,
            program,
            texture,
        })
    }
    pub fn render(
        &mut self,
        calls: &[Call],
        width: u32,
        height: u32,
        premultiplied: bool,
    ) -> Result<(), String> {
        if self.canvas.width() != width {
            self.canvas.set_width(width);
        }
        if self.canvas.height() != height {
            self.canvas.set_height(height);
        }
        self.ctx
            .reset_transform()
            .map_err(|_| "overlay reset failed")?;
        self.ctx
            .set_global_composite_operation("source-over")
            .map_err(|_| "overlay blend failed")?;
        self.ctx.clear_rect(0.0, 0.0, width as f64, height as f64);
        let state = RefCell::new(CanvasState::default());
        for call in calls {
            crate::drawing::canvas(call, &self.ctx, &state, width as f64, height as f64).map_err(
                |e| match call.location {
                    Some(l) => format!(
                        "Runtime error:  --> {}:{}\n  |\n  = {}",
                        l.line, l.column, e
                    ),
                    None => e,
                },
            )?;
        }
        state.borrow().balanced()?;
        let gl = &self.gl;
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(&self.texture));
        gl.pixel_storei(GL::UNPACK_FLIP_Y_WEBGL, 0);
        gl.pixel_storei(GL::UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
        gl.tex_image_2d_with_u32_and_u32_and_html_canvas_element(
            GL::TEXTURE_2D,
            0,
            GL::RGBA as i32,
            GL::RGBA,
            GL::UNSIGNED_BYTE,
            &self.canvas,
        )
        .map_err(|_| "overlay upload failed")?;
        gl.use_program(Some(&self.program));
        gl.bind_vertex_array(None);
        gl.uniform1i(gl.get_uniform_location(&self.program, "source").as_ref(), 0);
        gl.uniform1i(
            gl.get_uniform_location(&self.program, "premultiply")
                .as_ref(),
            i32::from(premultiplied),
        );
        gl.disable(GL::DEPTH_TEST);
        gl.depth_mask(false);
        gl.disable(GL::CULL_FACE);
        gl.enable(GL::BLEND);
        gl.blend_equation(GL::FUNC_ADD);
        gl.blend_func_separate(
            if premultiplied {
                GL::ONE
            } else {
                GL::SRC_ALPHA
            },
            GL::ONE_MINUS_SRC_ALPHA,
            GL::ONE,
            GL::ONE_MINUS_SRC_ALPHA,
        );
        gl.draw_arrays(GL::TRIANGLES, 0, 3);
        Ok(())
    }
}
impl Drop for Overlay {
    fn drop(&mut self) {
        self.gl.delete_texture(Some(&self.texture));
        self.gl.delete_program(Some(&self.program));
    }
}
