//! Host-supplied asset data.
//!
//! The engine never fetches anything. The page resolves an asset id against
//! what the current viewer is allowed to read — which is what VIS-51's row and
//! storage policies decide — and hands the decoded result in here. Keeping the
//! fetch outside the engine is what stops the renderer becoming a way to read
//! an asset the viewer has no access to.

use std::collections::HashMap;

use crate::scene::MeshData;

/// Decoded, premultiplied-alpha RGBA pixels for one asset.
pub struct TexturePixels {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    /// Bumped whenever the pixels change, so the renderer knows to re-upload
    /// rather than keep a stale GPU copy.
    pub version: u32,
}

#[derive(Default)]
pub struct AssetStore {
    textures: HashMap<String, TexturePixels>,
    meshes: HashMap<String, MeshData>,
}

impl AssetStore {
    pub fn set_texture(&mut self, id: &str, width: u32, height: u32, rgba: Vec<u8>) {
        let version = self.textures.get(id).map(|t| t.version + 1).unwrap_or(0);
        self.textures.insert(
            id.to_string(),
            TexturePixels {
                width,
                height,
                rgba,
                version,
            },
        );
    }

    pub fn texture(&self, id: &str) -> Option<&TexturePixels> {
        self.textures.get(id)
    }

    pub fn set_mesh(&mut self, id: &str, mesh: MeshData) {
        self.meshes.insert(id.to_string(), mesh);
    }

    pub fn mesh(&self, id: &str) -> Option<&MeshData> {
        self.meshes.get(id)
    }

    /// Dropped when the viewer changes or a visual is unloaded: an asset one
    /// viewer could read must not stay resident for the next one.
    pub fn clear(&mut self) {
        self.textures.clear();
        self.meshes.clear();
    }

    pub fn len(&self) -> usize {
        self.textures.len() + self.meshes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}
