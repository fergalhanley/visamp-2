//! Shared GPU output for live playback and capture; never writes feedback history.
use crate::{
    feedback::Target,
    filters::{Filter, Kind},
};
use web_sys::{WebGl2RenderingContext as GL, WebGlProgram, WebGlTexture, WebGlUniformLocation};
struct Level {
    targets: [Target; 2],
    width: u32,
    height: u32,
}
pub struct Postprocess {
    gl: GL,
    program: WebGlProgram,
    source: Option<WebGlUniformLocation>,
    size: Option<WebGlUniformLocation>,
    kind: Option<WebGlUniformLocation>,
    amount: Option<WebGlUniformLocation>,
    axis: Option<WebGlUniformLocation>,
    levels: Vec<Level>,
}
impl Postprocess {
    pub fn new(gl: &GL) -> Result<Self, String> {
        let program =
            crate::renderer::link(gl, crate::feedback::VERTEX, include_str!("filters.frag"))?;
        Ok(Self {
            gl: gl.clone(),
            source: gl.get_uniform_location(&program, "u_source"),
            size: gl.get_uniform_location(&program, "u_size"),
            kind: gl.get_uniform_location(&program, "u_kind"),
            amount: gl.get_uniform_location(&program, "u_amount"),
            axis: gl.get_uniform_location(&program, "u_axis"),
            program,
            levels: Vec::new(),
        })
    }
    pub fn reset(&mut self) {
        self.levels.clear();
    }
    fn level(&mut self, index: usize, width: u32, height: u32) -> Result<(), String> {
        if self
            .levels
            .get(index)
            .is_some_and(|l| l.width != width || l.height != height)
        {
            self.levels.truncate(index);
        }
        if self.levels.len() == index {
            self.levels.push(Level {
                targets: [
                    Target::new(&self.gl, width, height, false)?,
                    Target::new(&self.gl, width, height, false)?,
                ],
                width,
                height,
            });
        }
        Ok(())
    }
    fn draw(
        &self,
        source: &WebGlTexture,
        destination: Option<&Target>,
        width: u32,
        height: u32,
        kind: i32,
        amount: f32,
        axis: [f32; 2],
    ) {
        let gl = &self.gl;
        gl.use_program(Some(&self.program));
        gl.bind_vertex_array(None);
        gl.bind_framebuffer(GL::FRAMEBUFFER, destination.map(|t| &t.framebuffer));
        gl.viewport(0, 0, width as i32, height as i32);
        gl.disable(GL::DEPTH_TEST);
        gl.disable(GL::CULL_FACE);
        gl.disable(GL::BLEND);
        gl.disable(GL::SCISSOR_TEST);
        gl.disable(GL::DITHER);
        gl.color_mask(true, true, true, true);
        gl.active_texture(GL::TEXTURE0);
        gl.bind_texture(GL::TEXTURE_2D, Some(source));
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);
        gl.uniform1i(self.source.as_ref(), 0);
        gl.uniform2f(self.size.as_ref(), width as f32, height as f32);
        gl.uniform1i(self.kind.as_ref(), kind);
        gl.uniform1f(self.amount.as_ref(), amount);
        gl.uniform2f(self.axis.as_ref(), axis[0], axis[1]);
        gl.draw_arrays(GL::TRIANGLES, 0, 3);
        // Preserve the exact texel sampling contract of the feedback textures.
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::NEAREST as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::NEAREST as i32);
    }
    pub fn render(
        &mut self,
        source: &WebGlTexture,
        width: u32,
        height: u32,
        filters: &[Filter],
    ) -> Result<(), String> {
        if filters.len() > crate::filters::MAX_FILTERS {
            return Err("filter limit exceeded (32)".into());
        }
        if filters.is_empty() {
            self.draw(source, None, width, height, 0, 0.0, [0.0, 0.0]);
            return Ok(());
        }
        self.level(0, width, height)?;
        let mut current = source.clone();
        let mut output = 0;
        for f in filters {
            if f.kind == Kind::Blur && f.amount > 0.0 {
                let mut level = 0;
                let (mut w, mut h) = (width, height);
                let mut sigma = f.amount;
                while sigma > 8.0 && (w > 1 || h > 1) {
                    level += 1;
                    w = w.div_ceil(2);
                    h = h.div_ceil(2);
                    sigma = f.amount * (w as f32 / width as f32).max(h as f32 / height as f32);
                    self.level(level, w, h)?;
                    self.draw(
                        &current,
                        Some(&self.levels[level].targets[0]),
                        w,
                        h,
                        0,
                        0.0,
                        [0.0, 0.0],
                    );
                    current = self.levels[level].targets[0].texture.clone();
                }
                let horizontal = if level == 0 { output } else { 1 };
                let vertical = 1 - horizontal;
                self.draw(
                    &current,
                    Some(&self.levels[level].targets[horizontal]),
                    w,
                    h,
                    9,
                    f.amount * (w as f32 / width as f32),
                    [1.0, 0.0],
                );
                self.draw(
                    &self.levels[level].targets[horizontal].texture,
                    Some(&self.levels[level].targets[vertical]),
                    w,
                    h,
                    9,
                    f.amount * (h as f32 / height as f32),
                    [0.0, 1.0],
                );
                current = self.levels[level].targets[vertical].texture.clone();
                if level == 0 {
                    output = horizontal;
                } else {
                    for i in (0..level).rev() {
                        let l = &self.levels[i];
                        let slot = if i == 0 { output } else { 1 };
                        self.draw(
                            &current,
                            Some(&l.targets[slot]),
                            l.width,
                            l.height,
                            0,
                            0.0,
                            [0.0, 0.0],
                        );
                        current = l.targets[slot].texture.clone();
                    }
                    output = 1 - output;
                }
            } else if f.kind != Kind::Blur {
                self.draw(
                    &current,
                    Some(&self.levels[0].targets[output]),
                    width,
                    height,
                    f.kind as i32,
                    f.amount,
                    [0.0, 0.0],
                );
                current = self.levels[0].targets[output].texture.clone();
                output = 1 - output;
            }
        }
        self.draw(&current, None, width, height, 0, 0.0, [0.0, 0.0]);
        self.gl.bind_texture(GL::TEXTURE_2D, None);
        Ok(())
    }
}
impl Drop for Postprocess {
    fn drop(&mut self) {
        self.gl.delete_program(Some(&self.program));
    }
}
