//! Vector and matrix maths for 3d mode.
//!
//! Column-major 4x4 matrices and `f32` throughout, matching what WebGL expects,
//! so a model matrix can be handed to `uniformMatrix4fv` without transposing or
//! narrowing on the way.

pub type Vec3 = [f32; 3];

pub fn sub(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

pub fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

pub fn dot(a: Vec3, b: Vec3) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

pub fn length(v: Vec3) -> f32 {
    dot(v, v).sqrt()
}

/// Normalises, or returns the fallback when the input is degenerate.
///
/// A camera looking at its own position, or a light with a zero direction, is
/// a script mistake that should not become `NaN` and take the whole frame with
/// it — every later matrix would be poisoned and the canvas would go blank.
pub fn normalise_or(v: Vec3, fallback: Vec3) -> Vec3 {
    let len = length(v);
    if len < 1e-6 || !len.is_finite() {
        return fallback;
    }
    [v[0] / len, v[1] / len, v[2] / len]
}

/// A column-major 4x4 matrix: `m[col * 4 + row]`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Mat4(pub [f32; 16]);

impl Default for Mat4 {
    fn default() -> Self {
        Mat4::IDENTITY
    }
}

impl Mat4 {
    pub const IDENTITY: Mat4 = Mat4([
        1.0, 0.0, 0.0, 0.0, //
        0.0, 1.0, 0.0, 0.0, //
        0.0, 0.0, 1.0, 0.0, //
        0.0, 0.0, 0.0, 1.0,
    ]);

    pub fn as_slice(&self) -> &[f32; 16] {
        &self.0
    }

    /// `self * rhs`, so the right-hand matrix is applied first — the usual
    /// reading of `parent * child`.
    pub fn mul(&self, rhs: &Mat4) -> Mat4 {
        let a = &self.0;
        let b = &rhs.0;
        let mut out = [0.0f32; 16];

        for col in 0..4 {
            for row in 0..4 {
                let mut sum = 0.0;
                for k in 0..4 {
                    sum += a[k * 4 + row] * b[col * 4 + k];
                }
                out[col * 4 + row] = sum;
            }
        }

        Mat4(out)
    }

    pub fn transform_point(&self, p: Vec3) -> Vec3 {
        let m = &self.0;
        let w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
        let w = if w.abs() < 1e-9 { 1.0 } else { w };
        [
            (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
            (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w,
            (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w,
        ]
    }

    pub fn translation(x: f32, y: f32, z: f32) -> Mat4 {
        let mut m = Mat4::IDENTITY;
        m.0[12] = x;
        m.0[13] = y;
        m.0[14] = z;
        m
    }

    pub fn scaling(x: f32, y: f32, z: f32) -> Mat4 {
        let mut m = Mat4::IDENTITY;
        m.0[0] = x;
        m.0[5] = y;
        m.0[10] = z;
        m
    }

    pub fn rotation_x(rad: f32) -> Mat4 {
        let (s, c) = rad.sin_cos();
        let mut m = Mat4::IDENTITY;
        m.0[5] = c;
        m.0[6] = s;
        m.0[9] = -s;
        m.0[10] = c;
        m
    }

    pub fn rotation_y(rad: f32) -> Mat4 {
        let (s, c) = rad.sin_cos();
        let mut m = Mat4::IDENTITY;
        m.0[0] = c;
        m.0[2] = -s;
        m.0[8] = s;
        m.0[10] = c;
        m
    }

    pub fn rotation_z(rad: f32) -> Mat4 {
        let (s, c) = rad.sin_cos();
        let mut m = Mat4::IDENTITY;
        m.0[0] = c;
        m.0[1] = s;
        m.0[4] = -s;
        m.0[5] = c;
        m
    }

    /// Right-handed perspective, `-Z` into the screen.
    ///
    /// `fov_rad` is the *vertical* field of view; aspect comes from the canvas,
    /// never from the script.
    pub fn perspective(fov_rad: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
        let f = 1.0 / (fov_rad / 2.0).tan();
        let range = 1.0 / (near - far);
        let aspect = if aspect.is_finite() && aspect > 1e-6 { aspect } else { 1.0 };

        Mat4([
            f / aspect, 0.0, 0.0, 0.0, //
            0.0, f, 0.0, 0.0, //
            0.0, 0.0, (near + far) * range, -1.0, //
            0.0, 0.0, near * far * range * 2.0, 0.0,
        ])
    }

    /// Right-handed orthographic, sized by height so the script stays
    /// aspect-independent.
    pub fn orthographic(height: f32, aspect: f32, near: f32, far: f32) -> Mat4 {
        let aspect = if aspect.is_finite() && aspect > 1e-6 { aspect } else { 1.0 };
        let half_h = (height / 2.0).max(1e-6);
        let half_w = half_h * aspect;
        let depth = (far - near).max(1e-6);

        Mat4([
            1.0 / half_w, 0.0, 0.0, 0.0, //
            0.0, 1.0 / half_h, 0.0, 0.0, //
            0.0, 0.0, -2.0 / depth, 0.0, //
            0.0, 0.0, -(far + near) / depth, 1.0,
        ])
    }

    /// A right-handed view matrix looking from `eye` towards `target`.
    pub fn look_at(eye: Vec3, target: Vec3, up: Vec3) -> Mat4 {
        // Degenerate inputs fall back to looking down -Z rather than producing
        // a matrix full of NaN.
        let forward = normalise_or(sub(eye, target), [0.0, 0.0, 1.0]);
        let right = normalise_or(cross(up, forward), [1.0, 0.0, 0.0]);
        let true_up = cross(forward, right);

        Mat4([
            right[0], true_up[0], forward[0], 0.0, //
            right[1], true_up[1], forward[1], 0.0, //
            right[2], true_up[2], forward[2], 0.0, //
            -dot(right, eye), -dot(true_up, eye), -dot(forward, eye), 1.0,
        ])
    }

    /// The upper-left 3x3 inverse-transpose, as a 3x3 for shading normals.
    ///
    /// Normals do not survive a non-uniform scale under the model matrix — a
    /// squashed cube would light as if it were still square. Falls back to the
    /// rotation part when the matrix is singular.
    pub fn normal_matrix(&self) -> [f32; 9] {
        let m = &self.0;
        let a = [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];

        let det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[3] * (a[1] * a[8] - a[2] * a[7])
            + a[6] * (a[1] * a[5] - a[2] * a[4]);

        if det.abs() < 1e-9 || !det.is_finite() {
            return a;
        }

        let inv = 1.0 / det;
        // Inverse then transpose, folded together.
        [
            (a[4] * a[8] - a[5] * a[7]) * inv,
            (a[5] * a[6] - a[3] * a[8]) * inv,
            (a[3] * a[7] - a[4] * a[6]) * inv,
            (a[2] * a[7] - a[1] * a[8]) * inv,
            (a[0] * a[8] - a[2] * a[6]) * inv,
            (a[1] * a[6] - a[0] * a[7]) * inv,
            (a[1] * a[5] - a[2] * a[4]) * inv,
            (a[2] * a[3] - a[0] * a[5]) * inv,
            (a[0] * a[4] - a[1] * a[3]) * inv,
        ]
    }
}
