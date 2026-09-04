//! CPU-side mesh generation for the 3d primitives.
//!
//! Each primitive is built once at unit size around the origin and then reused
//! for every instance, with position, rotation and scale carried entirely by
//! the per-instance model matrix. That is what lets a `for` loop of 4096 cubes
//! be one draw call over one vertex buffer.

use crate::scene::{MeshData, Primitive};

/// Interleaved position + normal, ready to upload.
#[derive(Debug, Clone, Default)]
pub struct Geometry {
    /// `[x, y, z, nx, ny, nz]` per vertex.
    pub vertices: Vec<f32>,
    pub indices: Vec<u32>,
}

impl Geometry {
    fn vertex(&mut self, position: [f32; 3], normal: [f32; 3]) -> u32 {
        let index = (self.vertices.len() / 6) as u32;
        self.vertices.extend_from_slice(&position);
        self.vertices.extend_from_slice(&normal);
        index
    }

    fn triangle(&mut self, a: u32, b: u32, c: u32) {
        self.indices.extend_from_slice(&[a, b, c]);
    }

    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    pub fn vertex_count(&self) -> usize {
        self.vertices.len() / 6
    }

    /// Line-segment indices for wireframe drawing, one pair per triangle edge.
    pub fn edges(&self) -> Vec<u32> {
        let mut out = Vec::with_capacity(self.indices.len() * 2);
        for tri in self.indices.chunks_exact(3) {
            out.extend_from_slice(&[tri[0], tri[1], tri[1], tri[2], tri[2], tri[0]]);
        }
        out
    }
}

pub fn build(primitive: Primitive, meshes: &[MeshData]) -> Geometry {
    match primitive {
        Primitive::Cube => cube(),
        Primitive::Sphere { resolution } => sphere(resolution.clamp(3, 128)),
        Primitive::Plane { subdivisions } => plane(subdivisions.clamp(1, 128)),
        Primitive::Cylinder { segments } => cylinder(segments.clamp(3, 128)),
        Primitive::Cone { segments } => cone(segments.clamp(3, 128)),
        Primitive::Torus {
            segments,
            tube_segments,
            tube_ratio,
        } => torus(
            segments.clamp(3, 128),
            tube_segments.clamp(3, 64),
            tube_ratio as f32 / 1000.0,
        ),
        // A unit quad; the vertex shader rebuilds it in the camera's plane.
        Primitive::Sprite => quad(),
        Primitive::Mesh { id } => meshes.get(id as usize).map(custom).unwrap_or_default(),
    }
}

/// A unit cube, so `draw::cube()` spans -0.5..0.5 on every axis.
///
/// Each face gets its own four vertices: sharing corners would average the
/// normals and light a cube like a ball.
fn cube() -> Geometry {
    let mut g = Geometry::default();

    let faces: [([f32; 3], [f32; 3], [f32; 3]); 6] = [
        ([0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]), // +Z
        ([0.0, 0.0, -1.0], [-1.0, 0.0, 0.0], [0.0, 1.0, 0.0]), // -Z
        ([1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]), // +X
        ([-1.0, 0.0, 0.0], [0.0, 0.0, 1.0], [0.0, 1.0, 0.0]), // -X
        ([0.0, 1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, -1.0]), // +Y
        ([0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]), // -Y
    ];

    for (normal, right, up) in faces {
        let centre = [normal[0] * 0.5, normal[1] * 0.5, normal[2] * 0.5];
        let corner = |s: f32, t: f32| {
            [
                centre[0] + right[0] * s * 0.5 + up[0] * t * 0.5,
                centre[1] + right[1] * s * 0.5 + up[1] * t * 0.5,
                centre[2] + right[2] * s * 0.5 + up[2] * t * 0.5,
            ]
        };

        let a = g.vertex(corner(-1.0, -1.0), normal);
        let b = g.vertex(corner(1.0, -1.0), normal);
        let c = g.vertex(corner(1.0, 1.0), normal);
        let d = g.vertex(corner(-1.0, 1.0), normal);
        g.triangle(a, b, c);
        g.triangle(a, c, d);
    }

    g
}

/// A UV sphere of radius 0.5, so `draw::sphere()` is unit-diameter and the
/// `radius` argument scales it.
fn sphere(resolution: u32) -> Geometry {
    let mut g = Geometry::default();
    let rings = resolution;
    let segments = resolution * 2;

    for ring in 0..=rings {
        let v = ring as f32 / rings as f32;
        let phi = v * std::f32::consts::PI;
        let (sin_phi, cos_phi) = phi.sin_cos();

        for segment in 0..=segments {
            let u = segment as f32 / segments as f32;
            let theta = u * std::f32::consts::TAU;
            let (sin_theta, cos_theta) = theta.sin_cos();

            let normal = [sin_phi * cos_theta, cos_phi, sin_phi * sin_theta];
            g.vertex([normal[0] * 0.5, normal[1] * 0.5, normal[2] * 0.5], normal);
        }
    }

    let stride = segments + 1;
    for ring in 0..rings {
        for segment in 0..segments {
            let a = ring * stride + segment;
            let b = a + stride;
            g.triangle(a, b, a + 1);
            g.triangle(a + 1, b, b + 1);
        }
    }

    g
}

/// A unit square in the XZ plane facing +Y — a floor.
fn plane(subdivisions: u32) -> Geometry {
    let mut g = Geometry::default();
    let n = subdivisions;

    for row in 0..=n {
        for col in 0..=n {
            let x = col as f32 / n as f32 - 0.5;
            let z = row as f32 / n as f32 - 0.5;
            g.vertex([x, 0.0, z], [0.0, 1.0, 0.0]);
        }
    }

    let stride = n + 1;
    for row in 0..n {
        for col in 0..n {
            let a = row * stride + col;
            let b = a + stride;
            g.triangle(a, b, a + 1);
            g.triangle(a + 1, b, b + 1);
        }
    }

    g
}

/// A unit-diameter, unit-height cylinder centred on the origin.
fn cylinder(segments: u32) -> Geometry {
    let mut g = Geometry::default();

    // Side wall.
    for i in 0..=segments {
        let t = i as f32 / segments as f32 * std::f32::consts::TAU;
        let (sin, cos) = t.sin_cos();
        let normal = [cos, 0.0, sin];
        g.vertex([cos * 0.5, -0.5, sin * 0.5], normal);
        g.vertex([cos * 0.5, 0.5, sin * 0.5], normal);
    }

    for i in 0..segments {
        let a = i * 2;
        g.triangle(a, a + 1, a + 2);
        g.triangle(a + 1, a + 3, a + 2);
    }

    // Caps, with their own vertices so the rim stays sharp.
    for (y, normal) in [(0.5f32, [0.0, 1.0, 0.0]), (-0.5, [0.0, -1.0, 0.0])] {
        let centre = g.vertex([0.0, y, 0.0], normal);
        let first = g.vertices.len() / 6;

        for i in 0..=segments {
            let t = i as f32 / segments as f32 * std::f32::consts::TAU;
            let (sin, cos) = t.sin_cos();
            g.vertex([cos * 0.5, y, sin * 0.5], normal);
        }

        for i in 0..segments {
            let a = first as u32 + i;
            if normal[1] > 0.0 {
                g.triangle(centre, a, a + 1);
            } else {
                g.triangle(centre, a + 1, a);
            }
        }
    }

    g
}

/// A unit-diameter, unit-height cone, apex at +Y.
fn cone(segments: u32) -> Geometry {
    let mut g = Geometry::default();

    for i in 0..segments {
        let t0 = i as f32 / segments as f32 * std::f32::consts::TAU;
        let t1 = (i + 1) as f32 / segments as f32 * std::f32::consts::TAU;
        let (s0, c0) = t0.sin_cos();
        let (s1, c1) = t1.sin_cos();

        // Slant normal: the side rises one unit over a half-unit radius.
        let mid = ((t0 + t1) / 2.0).sin_cos();
        let normal = normalise([mid.1, 0.5, mid.0]);

        let apex = g.vertex([0.0, 0.5, 0.0], normal);
        let a = g.vertex([c0 * 0.5, -0.5, s0 * 0.5], normalise([c0, 0.5, s0]));
        let b = g.vertex([c1 * 0.5, -0.5, s1 * 0.5], normalise([c1, 0.5, s1]));
        g.triangle(apex, a, b);
    }

    // Base.
    let down = [0.0, -1.0, 0.0];
    let centre = g.vertex([0.0, -0.5, 0.0], down);
    let first = (g.vertices.len() / 6) as u32;
    for i in 0..=segments {
        let t = i as f32 / segments as f32 * std::f32::consts::TAU;
        let (sin, cos) = t.sin_cos();
        g.vertex([cos * 0.5, -0.5, sin * 0.5], down);
    }
    for i in 0..segments {
        g.triangle(centre, first + i + 1, first + i);
    }

    g
}

/// A torus of ring radius 0.5 lying in the XZ plane, with the tube sized as a
/// fraction of the ring.
fn torus(segments: u32, tube_segments: u32, tube_ratio: f32) -> Geometry {
    let mut g = Geometry::default();
    let ring_radius = 0.5;
    // Proportional to the ring, so a uniform scale by `radius` keeps the tube
    // in step and identical tori still share one mesh.
    let tube_radius = ring_radius * tube_ratio.clamp(0.001, 4.0);

    for i in 0..=segments {
        let u = i as f32 / segments as f32 * std::f32::consts::TAU;
        let (sin_u, cos_u) = u.sin_cos();

        for j in 0..=tube_segments {
            let v = j as f32 / tube_segments as f32 * std::f32::consts::TAU;
            let (sin_v, cos_v) = v.sin_cos();

            let normal = [cos_u * cos_v, sin_v, sin_u * cos_v];
            g.vertex(
                [
                    (ring_radius + tube_radius * cos_v) * cos_u,
                    tube_radius * sin_v,
                    (ring_radius + tube_radius * cos_v) * sin_u,
                ],
                normal,
            );
        }
    }

    let stride = tube_segments + 1;
    for i in 0..segments {
        for j in 0..tube_segments {
            let a = i * stride + j;
            let b = a + stride;
            g.triangle(a, b, a + 1);
            g.triangle(a + 1, b, b + 1);
        }
    }

    g
}

/// A unit quad in the XY plane, used for sprites.
fn quad() -> Geometry {
    let mut g = Geometry::default();
    let n = [0.0, 0.0, 1.0];
    let a = g.vertex([-0.5, -0.5, 0.0], n);
    let b = g.vertex([0.5, -0.5, 0.0], n);
    let c = g.vertex([0.5, 0.5, 0.0], n);
    let d = g.vertex([-0.5, 0.5, 0.0], n);
    g.triangle(a, b, c);
    g.triangle(a, c, d);
    g
}

/// Script-supplied geometry. Normals are computed per face when absent, which
/// is what §6.4 promises.
fn custom(mesh: &MeshData) -> Geometry {
    let mut g = Geometry::default();

    let indices: Vec<u32> = if mesh.indices.is_empty() {
        (0..mesh.vertices.len() as u32).collect()
    } else {
        mesh.indices.clone()
    };

    for tri in indices.chunks_exact(3) {
        let p: Vec<[f32; 3]> = tri
            .iter()
            .map(|i| mesh.vertices.get(*i as usize).copied().unwrap_or([0.0; 3]))
            .collect();

        let face = normalise(cross(sub(p[1], p[0]), sub(p[2], p[0])));

        for (slot, point) in tri.iter().zip(p.iter()) {
            let normal = mesh.normals.get(*slot as usize).copied().unwrap_or(face);
            let index = g.vertex(*point, normal);
            g.indices.push(index);
        }
    }

    g
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn cross(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn normalise(v: [f32; 3]) -> [f32; 3] {
    let len = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    if len < 1e-6 {
        return [0.0, 1.0, 0.0];
    }
    [v[0] / len, v[1] / len, v[2] / len]
}
