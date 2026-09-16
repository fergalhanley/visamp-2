//! Shared GPU output for live playback and capture; never writes feedback history.
use crate::{
    feedback::Target,
    filters::{Filter, Kind},
};
use web_sys::{WebGl2RenderingContext as GL, WebGlProgram, WebGlTexture, WebGlUniformLocation};
struct MapTexture {
    gl: GL,
    texture: WebGlTexture,
    version: u32,
    epoch: u64,
}
impl Drop for MapTexture {
    fn drop(&mut self) {
        self.gl.delete_texture(Some(&self.texture));
    }
}
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
    params0: Option<WebGlUniformLocation>,
    params1: Option<WebGlUniformLocation>,
    gap: Option<WebGlUniformLocation>,
    aux: Option<WebGlUniformLocation>,
    bloom_base: Option<Target>,
    maps: std::collections::HashMap<String, MapTexture>,
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
            params0: gl.get_uniform_location(&program, "u_params0"),
            params1: gl.get_uniform_location(&program, "u_params1"),
            gap: gl.get_uniform_location(&program, "u_gap"),
            aux: gl.get_uniform_location(&program, "u_aux"),
            bloom_base: None,
            maps: Default::default(),
            program,
            levels: Vec::new(),
        })
    }
    pub fn reset(&mut self) {
        self.levels.clear();
        self.bloom_base = None;
        self.maps.clear();
    }
    fn level(&mut self, index: usize, width: u32, height: u32) -> Result<(), String> {
        if self
            .levels
            .get(index)
            .is_some_and(|l| l.width != width || l.height != height)
        {
            self.levels.truncate(index);
            if index == 0 {
                self.bloom_base = None;
            }
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
        self.draw_effect(
            source,
            destination,
            width,
            height,
            kind,
            amount,
            axis,
            None,
            None,
        );
    }
    fn draw_effect(
        &self,
        source: &WebGlTexture,
        destination: Option<&Target>,
        width: u32,
        height: u32,
        kind: i32,
        amount: f32,
        axis: [f32; 2],
        effect: Option<&Filter>,
        auxiliary: Option<&WebGlTexture>,
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
        let params = effect.map(|f| f.params).unwrap_or([0.0; 8]);
        let color = effect.map(|f| f.color).unwrap_or([0.0; 4]);
        gl.uniform4fv_with_f32_array(self.params0.as_ref(), &params[..4]);
        gl.uniform4fv_with_f32_array(self.params1.as_ref(), &params[4..]);
        gl.uniform4fv_with_f32_array(self.gap.as_ref(), &color);
        gl.uniform1i(self.aux.as_ref(), if auxiliary.is_some() { 3 } else { 0 });
        if let Some(texture) = auxiliary {
            gl.active_texture(GL::TEXTURE3);
            gl.bind_texture(GL::TEXTURE_2D, Some(texture));
            gl.active_texture(GL::TEXTURE0);
        }
        gl.draw_arrays(GL::TRIANGLES, 0, 3);
        if auxiliary.is_some() {
            gl.active_texture(GL::TEXTURE3);
            gl.bind_texture(GL::TEXTURE_2D, None);
            gl.active_texture(GL::TEXTURE0);
        }
        // Preserve the exact texel sampling contract of the feedback textures.
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::NEAREST as i32);
        gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::NEAREST as i32);
    }
    fn blur(
        &mut self,
        mut current: WebGlTexture,
        width: u32,
        height: u32,
        amount: f32,
        output: &mut usize,
    ) -> Result<WebGlTexture, String> {
        if amount <= 0.001 {
            return Ok(current);
        }
        let mut level = 0;
        let (mut w, mut h) = (width, height);
        let mut sigma = amount;
        while sigma > 8.0 && (w > 1 || h > 1) {
            level += 1;
            w = w.div_ceil(2);
            h = h.div_ceil(2);
            sigma = amount * (w as f32 / width as f32).max(h as f32 / height as f32);
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
        let horizontal = if level == 0 { *output } else { 1 };
        let vertical = 1 - horizontal;
        self.draw(
            &current,
            Some(&self.levels[level].targets[horizontal]),
            w,
            h,
            9,
            amount * (w as f32 / width as f32),
            [1.0, 0.0],
        );
        self.draw(
            &self.levels[level].targets[horizontal].texture,
            Some(&self.levels[level].targets[vertical]),
            w,
            h,
            9,
            amount * (h as f32 / height as f32),
            [0.0, 1.0],
        );
        current = self.levels[level].targets[vertical].texture.clone();
        if level == 0 {
            *output = horizontal;
        } else {
            for i in (0..level).rev() {
                let l = &self.levels[i];
                let slot = if i == 0 { *output } else { 1 };
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
            *output = 1 - *output;
        }
        Ok(current)
    }
    fn map(&mut self, id: &str) -> Result<WebGlTexture, String> {
        crate::assets::with_store(|store| {
            let pixels = store
                .texture(id)
                .ok_or("displacement bitmap is not loaded")?;
            let epoch = store.epoch();
            if let Some(cached) = self.maps.get(id) {
                if cached.version == pixels.version && cached.epoch == epoch {
                    return Ok(cached.texture.clone());
                }
            }
            let gl = &self.gl;
            let max = gl
                .get_parameter(GL::MAX_TEXTURE_SIZE)
                .ok()
                .and_then(|n| n.as_f64())
                .unwrap_or(0.0);
            if pixels.width as f64 > max || pixels.height as f64 > max {
                return Err("displacement bitmap exceeds GPU texture dimensions".into());
            }
            let texture = gl
                .create_texture()
                .ok_or("could not create displacement texture")?;
            let entry = MapTexture {
                gl: gl.clone(),
                texture,
                version: pixels.version,
                epoch,
            };
            gl.active_texture(GL::TEXTURE0);
            gl.bind_texture(GL::TEXTURE_2D, Some(&entry.texture));
            gl.pixel_storei(GL::UNPACK_FLIP_Y_WEBGL, 0);
            gl.pixel_storei(GL::UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MIN_FILTER, GL::LINEAR as i32);
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_MAG_FILTER, GL::LINEAR as i32);
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_S, GL::CLAMP_TO_EDGE as i32);
            gl.tex_parameteri(GL::TEXTURE_2D, GL::TEXTURE_WRAP_T, GL::CLAMP_TO_EDGE as i32);
            gl.tex_image_2d_with_i32_and_i32_and_i32_and_format_and_type_and_opt_u8_array(
                GL::TEXTURE_2D,
                0,
                GL::RGBA8 as i32,
                pixels.width as i32,
                pixels.height as i32,
                0,
                GL::RGBA,
                GL::UNSIGNED_BYTE,
                Some(&pixels.rgba),
            )
            .map_err(|_| "could not upload displacement bitmap")?;
            gl.bind_texture(GL::TEXTURE_2D, None);
            let texture = entry.texture.clone();
            self.maps.insert(id.into(), entry);
            Ok(texture)
        })
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
        self.maps
            .retain(|id, _| filters.iter().any(|f| f.asset.as_ref() == Some(id)));
        if filters.is_empty() {
            self.draw(source, None, width, height, 0, 0.0, [0.0, 0.0]);
            return Ok(());
        }
        self.level(0, width, height)?;
        let mut current = source.clone();
        let mut output = 0;
        for f in filters {
            if f.kind == Kind::Bloom {
                if f.params[0] == 0.0 {
                    continue;
                }
                if self.bloom_base.is_none() {
                    self.bloom_base = Some(Target::new(&self.gl, width, height, false)?);
                }
                self.draw(
                    &current,
                    self.bloom_base.as_ref(),
                    width,
                    height,
                    0,
                    0.0,
                    [0.0; 2],
                );
                self.draw(
                    &current,
                    Some(&self.levels[0].targets[output]),
                    width,
                    height,
                    27,
                    f.amount,
                    [0.0; 2],
                );
                current = self.levels[0].targets[output].texture.clone();
                output = 1 - output;
                current = self.blur(current, width, height, f.params[1], &mut output)?;
                self.draw_effect(
                    &current,
                    Some(&self.levels[0].targets[output]),
                    width,
                    height,
                    28,
                    f.params[0],
                    [0.0; 2],
                    None,
                    Some(&self.bloom_base.as_ref().unwrap().texture),
                );
                current = self.levels[0].targets[output].texture.clone();
                output = 1 - output;
            } else if f.kind == Kind::Blur && f.amount > 0.0 {
                current = self.blur(current, width, height, f.amount, &mut output)?;
            } else if f.kind != Kind::Blur {
                let auxiliary = match &f.asset {
                    Some(id) => Some(self.map(id)?),
                    None => None,
                };
                self.draw_effect(
                    &current,
                    Some(&self.levels[0].targets[output]),
                    width,
                    height,
                    f.kind as i32,
                    f.amount,
                    [0.0, 0.0],
                    Some(f),
                    auxiliary.as_ref(),
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
