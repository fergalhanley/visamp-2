//! Experimental, read-only snapshot of the current Visript 3D scene.
//! This is a deliberately restricted bridge: no implicit skipping of features.
use crate::geometry;
use crate::scene::{BlendMode, Primitive, Scene, Shading};
use serde_json::{json, Value};

const MAX_HDR_TRIANGLES: usize = 16_384;

/// Serialize supported, unlit 3D scene commands for the optional WebGPU test.
/// Returns an explicit error for unsupported script features instead of
/// silently changing a visualisation's appearance.
pub fn snapshot(scene: &Scene, width: u32, height: u32) -> Result<String, String> {
    if width == 0 || height == 0 {
        return Err("HDR scene snapshot requires nonzero canvas dimensions".into());
    }
    if !scene.overlay_calls.is_empty() || !scene.point_clouds.is_empty() {
        return Err("HDR preview does not yet support overlays or point clouds".into());
    }
    if !scene.lights.is_empty() {
        return Err("HDR preview does not yet support scene lighting".into());
    }
    if scene.commands.iter().any(|cmd| {
        cmd.key.shading != Shading::Unlit
            || cmd.key.texture.is_some()
            || cmd.key.wireframe
            || cmd.key.blend != BlendMode::Alpha
            || cmd.key.overlay
    }) {
        return Err("HDR preview currently supports unlit, untextured, filled alpha primitives only".into());
    }
    let aspect = width as f32 / height as f32;
    let vp = scene.camera.projection_matrix(aspect).mul(&scene.camera.view());
    let mut triangles: Vec<Value> = Vec::new();
    for (index, command) in scene.commands.iter().enumerate() {
        if !matches!(command.key.primitive, Primitive::Cube | Primitive::Plane { .. }) {
            return Err("HDR preview currently supports cubes and planes only".into());
        }
        let mesh = geometry::build(command.key.primitive, &scene.meshes);
        let mvp = vp.mul(&command.model);
        let intensity = scene.hdr_intensities.get(index).copied().unwrap_or(1.0);
        let color = [
            command.color.r as f32 * intensity, command.color.g as f32 * intensity,
            command.color.b as f32 * intensity, (command.color.a as f32 * command.opacity),
        ];
        for inds in mesh.indices.chunks_exact(3) {
            if triangles.len() >= MAX_HDR_TRIANGLES {
                return Err("HDR preview triangle budget exceeded".into());
            }
            let mut xy = [0.0f32; 6];
            for (i, &idx) in inds.iter().enumerate() {
                let base = idx as usize * geometry::VERTEX_FLOATS;
                let vertex = mesh.vertices.get(base..base + 3)
                    .ok_or("HDR preview geometry has invalid indices")?;
                // Homogeneous clip transform. Explicitly refuse triangles
                // intersecting the near plane until proper clipping exists.
                let m = mvp.as_slice();
                let (x, y, z) = (vertex[0], vertex[1], vertex[2]);
                let w = m[3]*x + m[7]*y + m[11]*z + m[15];
                let clip_z = m[2]*x + m[6]*y + m[10]*z + m[14];
                if !w.is_finite() || w <= 0.0 || clip_z < -w {
                    return Err("HDR preview does not yet clip triangles at the near plane".into());
                }
                xy[i*2] = (m[0]*x + m[4]*y + m[8]*z + m[12]) / w;
                xy[i*2+1] = (m[1]*x + m[5]*y + m[9]*z + m[13]) / w;
            }
            triangles.push(json!({"vertices": xy, "color": color}));
        }
    }
    let clear = scene.gfx.clear.unwrap_or(crate::model::Color {
        r: 0.0, g: 0.0, b: 0.0, a: 1.0
    });
    serde_json::to_string(&json!({
        "clear": [clear.r, clear.g, clear.b, clear.a],
        "triangles": triangles
    })).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_scene_is_serializable() {
        let out = snapshot(&Scene::default(), 800, 600).unwrap();
        let value: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(value["triangles"].as_array().unwrap().len(), 0);
        assert_eq!(value["clear"][3], 1.0);
    }

    #[test]
    fn zero_dimensions_are_rejected() {
        assert!(snapshot(&Scene::default(), 0, 600).is_err());
    }
}
