//! The 3d scene: camera, transform stack, lights, render state, and the
//! command buffer that draws are recorded into.
//!
//! Nothing here touches WebGL. Script evaluation records *what* to draw and the
//! renderer decides *how*, which is what makes the batching in §9.2 possible —
//! consecutive draws sharing a primitive and a render state coalesce into one
//! instanced call, and that is the difference between 128 bars and 4096.
//!
//! It also means all of this is testable without a browser.

use crate::math3::{Mat4, Vec3};
use crate::model::Color;

/// Limits, from §9.3. Exceeding a per-frame one drops the rest of the frame
/// and warns, rather than killing a script that anyone can publish.
pub const MAX_DRAW_COMMANDS: usize = 8192;
pub const MAX_TRIANGLES: u64 = 2_000_000;
pub const MAX_MESH_VERTICES: usize = 65_536;
pub const MAX_STACK_DEPTH: usize = 64;
pub const MAX_DIRECTIONAL_LIGHTS: usize = 8;
pub const MAX_POINT_LIGHTS: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Projection {
    Perspective { fov_rad: f32, near: f32, far: f32 },
    Orthographic { height: f32, near: f32, far: f32 },
}

impl Default for Projection {
    fn default() -> Self {
        Projection::Perspective {
            fov_rad: 60.0f32.to_radians(),
            near: 0.1,
            far: 500.0,
        }
    }
}

/// How the camera is aimed. `look_at` and `direction` are two spellings of the
/// same thing, so the last call simply replaces whatever came before.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Aim {
    Target(Vec3),
    Direction(Vec3),
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Camera {
    pub projection: Projection,
    pub position: Vec3,
    pub aim: Aim,
    pub up: Vec3,
}

impl Default for Camera {
    /// §6.1: a bare `draw::cube()` must be visible with no camera setup.
    fn default() -> Self {
        Camera {
            projection: Projection::default(),
            position: [0.0, 0.0, 10.0],
            aim: Aim::Target([0.0, 0.0, 0.0]),
            up: [0.0, 1.0, 0.0],
        }
    }
}

impl Camera {
    pub fn view(&self) -> Mat4 {
        let target = match self.aim {
            Aim::Target(t) => t,
            Aim::Direction(d) => [
                self.position[0] + d[0],
                self.position[1] + d[1],
                self.position[2] + d[2],
            ],
        };
        Mat4::look_at(self.position, target, self.up)
    }

    pub fn projection_matrix(&self, aspect: f32) -> Mat4 {
        match self.projection {
            Projection::Perspective { fov_rad, near, far } => {
                // §6.1 clamps the field of view to (0, 179) degrees; outside
                // that the projection degenerates and nothing renders.
                let fov = fov_rad.clamp(0.001, 179.0f32.to_radians());
                Mat4::perspective(fov, aspect, near.max(1e-4), far.max(near + 1e-3))
            }
            Projection::Orthographic { height, near, far } => {
                Mat4::orthographic(height.max(1e-4), aspect, near, far.max(near + 1e-3))
            }
        }
    }

    /// §6.1 sugar: position and aim together, from spherical coordinates.
    pub fn orbit(&mut self, target: Vec3, distance: f32, yaw_rad: f32, pitch_rad: f32) {
        // Clamped just short of the poles: exactly overhead makes the up vector
        // parallel to the view direction and the view matrix degenerate.
        let limit = std::f32::consts::FRAC_PI_2 - 1e-3;
        let pitch = pitch_rad.clamp(-limit, limit);
        let (sin_p, cos_p) = pitch.sin_cos();
        let (sin_y, cos_y) = yaw_rad.sin_cos();

        self.position = [
            target[0] + distance * cos_p * sin_y,
            target[1] + distance * sin_p,
            target[2] + distance * cos_p * cos_y,
        ];
        self.aim = Aim::Target(target);
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DirectionalLight {
    pub direction: Vec3,
    pub color: Color,
    pub intensity: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct PointLight {
    pub position: Vec3,
    pub color: Color,
    pub intensity: f32,
    pub range: f32,
}

#[derive(Debug, Clone, Default)]
pub struct Lights {
    pub ambient: Option<Color>,
    pub directional: Vec<DirectionalLight>,
    pub point: Vec<PointLight>,
}

impl Lights {
    pub fn is_empty(&self) -> bool {
        self.ambient.is_none() && self.directional.is_empty() && self.point.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum BlendMode {
    #[default]
    Alpha,
    Additive,
    Multiply,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum CullMode {
    /// §6.7: `none` by default on purpose — someone drawing a plane and looking
    /// at it from below should see the plane, not a debugging session.
    #[default]
    None,
    Back,
    Front,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GfxState {
    pub depth_enabled: bool,
    pub depth_write: bool,
    pub blend: BlendMode,
    pub cull: CullMode,
    pub clear: Option<Color>,
    pub overlay: bool,
}

impl Default for GfxState {
    fn default() -> Self {
        GfxState {
            depth_enabled: true,
            depth_write: true,
            blend: BlendMode::Alpha,
            cull: CullMode::None,
            clear: None,
            overlay: false,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Shading {
    #[default]
    Unlit,
    Flat,
    Lambert,
}

/// Which shape to draw. Parameters that change the generated geometry are part
/// of the identity, since two spheres at different resolutions cannot share a
/// vertex buffer.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Primitive {
    Cube,
    Sphere { resolution: u32 },
    Plane { subdivisions: u32 },
    Cylinder { segments: u32 },
    Cone { segments: u32 },
    /// `tube_ratio` is the tube radius as a thousandth of the ring radius.
    /// It has to be part of the primitive's identity rather than a scale: a
    /// single matrix cannot scale a torus's tube independently of its ring, so
    /// two tori with different tube thicknesses are genuinely different meshes.
    Torus { segments: u32, tube_segments: u32, tube_ratio: u32 },
    Sprite,
    Mesh { id: u32 },
}

impl Primitive {
    /// Used to enforce the per-frame triangle budget before anything is built.
    pub fn triangle_count(&self, meshes: &[MeshData]) -> u64 {
        match *self {
            Primitive::Cube => 12,
            Primitive::Sphere { resolution } => {
                let r = resolution.max(3) as u64;
                r * r * 2
            }
            Primitive::Plane { subdivisions } => {
                let s = subdivisions.max(1) as u64;
                s * s * 2
            }
            Primitive::Cylinder { segments } => segments.max(3) as u64 * 4,
            Primitive::Cone { segments } => segments.max(3) as u64 * 2,
            Primitive::Torus { segments, tube_segments, .. } => {
                segments.max(3) as u64 * tube_segments.max(3) as u64 * 2
            }
            Primitive::Sprite => 2,
            Primitive::Mesh { id } => meshes
                .get(id as usize)
                .map(|m| m.triangle_count())
                .unwrap_or(0),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct MeshData {
    pub vertices: Vec<[f32; 3]>,
    pub indices: Vec<u32>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
}

impl MeshData {
    pub fn triangle_count(&self) -> u64 {
        if self.indices.is_empty() {
            self.vertices.len() as u64 / 3
        } else {
            self.indices.len() as u64 / 3
        }
    }
}

/// Everything that decides whether two draws can share one instanced call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct BatchKey {
    pub primitive: Primitive,
    pub shading: Shading,
    pub wireframe: bool,
    pub blend: BlendMode,
    pub cull: CullMode,
    pub depth_enabled: bool,
    pub depth_write: bool,
    pub overlay: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct DrawCommand {
    pub key: BatchKey,
    pub model: Mat4,
    pub color: Color,
    pub opacity: f32,
}

/// One instanced draw: a run of commands sharing a `BatchKey`.
#[derive(Debug, Clone)]
pub struct Batch {
    pub key: BatchKey,
    pub instances: Vec<DrawCommand>,
}

#[derive(Debug, Clone)]
pub struct Scene {
    pub camera: Camera,
    pub lights: Lights,
    pub gfx: GfxState,
    pub stack: Vec<Mat4>,
    pub commands: Vec<DrawCommand>,
    pub meshes: Vec<MeshData>,
    pub warnings: Vec<String>,
    triangles: u64,
    dropped: bool,
}

impl Default for Scene {
    fn default() -> Self {
        Scene {
            camera: Camera::default(),
            lights: Lights::default(),
            gfx: GfxState::default(),
            stack: vec![Mat4::IDENTITY],
            commands: Vec::new(),
            meshes: Vec::new(),
            warnings: Vec::new(),
            triangles: 0,
            dropped: false,
        }
    }
}

impl Scene {
    /// §9.1 — everything resets at the start of each `render` block, so no
    /// state leaks between frames. That is what makes live editing predictable.
    pub fn reset(&mut self) {
        *self = Scene::default();
    }

    pub fn top(&self) -> Mat4 {
        *self.stack.last().unwrap_or(&Mat4::IDENTITY)
    }

    fn set_top(&mut self, m: Mat4) {
        if let Some(top) = self.stack.last_mut() {
            *top = m;
        }
    }

    /// Post-multiplies the current matrix, so a transform applies within
    /// whatever frame the stack is already in.
    pub fn apply(&mut self, m: Mat4) {
        self.set_top(self.top().mul(&m));
    }

    pub fn push(&mut self) -> Result<(), String> {
        if self.stack.len() >= MAX_STACK_DEPTH {
            return Err(format!(
                "transform stack depth limit exceeded ({MAX_STACK_DEPTH})"
            ));
        }
        self.stack.push(self.top());
        Ok(())
    }

    pub fn pop(&mut self) -> Result<(), String> {
        if self.stack.len() <= 1 {
            return Err("transform::pop with empty stack".to_string());
        }
        self.stack.pop();
        Ok(())
    }

    pub fn identity(&mut self) {
        self.set_top(Mat4::IDENTITY);
    }

    /// §6.2 — the stack must be balanced when the block ends.
    pub fn check_balanced(&self) -> Result<(), String> {
        if self.stack.len() == 1 {
            return Ok(());
        }
        Err(format!(
            "unbalanced transform stack at end of frame (depth {}, expected 1)",
            self.stack.len()
        ))
    }

    /// §6.6 — `lambert` once any light exists, `unlit` otherwise, decided at
    /// the moment of the draw. This is why lights must come first.
    pub fn default_shading(&self) -> Shading {
        if self.lights.is_empty() {
            Shading::Unlit
        } else {
            Shading::Lambert
        }
    }

    pub fn add_directional(&mut self, light: DirectionalLight) {
        if self.directional_full() {
            return;
        }
        self.lights.directional.push(light);
    }

    pub fn add_point(&mut self, light: PointLight) {
        if self.point_full() {
            return;
        }
        self.lights.point.push(light);
    }

    fn directional_full(&mut self) -> bool {
        if self.lights.directional.len() < MAX_DIRECTIONAL_LIGHTS {
            return false;
        }
        self.warn_once("light limit reached, ignoring additional lights");
        true
    }

    fn point_full(&mut self) -> bool {
        if self.lights.point.len() < MAX_POINT_LIGHTS {
            return false;
        }
        self.warn_once("light limit reached, ignoring additional lights");
        true
    }

    fn warn_once(&mut self, message: &str) {
        if !self.warnings.iter().any(|w| w == message) {
            self.warnings.push(message.to_string());
        }
    }

    pub fn add_mesh(&mut self, mesh: MeshData) -> Result<u32, String> {
        if mesh.vertices.len() > MAX_MESH_VERTICES {
            return Err(format!(
                "draw::mesh: vertex count exceeds {MAX_MESH_VERTICES}"
            ));
        }
        self.meshes.push(mesh);
        Ok(self.meshes.len() as u32 - 1)
    }

    /// Records a draw, or drops it once a per-frame budget is spent.
    ///
    /// Dropping and warning beats failing: a script that loops too far should
    /// render a partial frame, not take the canvas down.
    pub fn record(&mut self, command: DrawCommand) {
        if self.commands.len() >= MAX_DRAW_COMMANDS {
            self.warn_dropped(format!(
                "draw command limit reached ({MAX_DRAW_COMMANDS}), dropping the rest of this frame"
            ));
            return;
        }

        let triangles = command.key.primitive.triangle_count(&self.meshes);
        if self.triangles + triangles > MAX_TRIANGLES {
            self.warn_dropped(format!(
                "triangle limit reached ({MAX_TRIANGLES}), dropping the rest of this frame"
            ));
            return;
        }

        self.triangles += triangles;
        self.commands.push(command);
    }

    fn warn_dropped(&mut self, message: String) {
        if self.dropped {
            return;
        }
        self.dropped = true;
        self.warnings.push(message);
    }

    pub fn triangles(&self) -> u64 {
        self.triangles
    }

    /// §9.2 — coalesces consecutive commands sharing a key into instanced
    /// draws.
    ///
    /// Only *consecutive* runs are merged, never reordered: with alpha blending
    /// the order commands were issued in is the order they must be drawn in,
    /// and sorting by key to get bigger batches would quietly change what the
    /// author sees. A `for` loop issuing one `draw::cube` per iteration already
    /// produces one long run, which is the case worth optimising.
    pub fn batches(&self) -> Vec<Batch> {
        let mut batches: Vec<Batch> = Vec::new();

        for command in &self.commands {
            match batches.last_mut() {
                Some(batch) if batch.key == command.key => batch.instances.push(*command),
                _ => batches.push(Batch {
                    key: command.key,
                    instances: vec![*command],
                }),
            }
        }

        batches
    }
}
