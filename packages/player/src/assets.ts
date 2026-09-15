import type { EngineModule, ResolvedAsset } from "./types";

/** Register one resolved asset; point-only GLBs do not have a triangle mesh. */
export function registerAsset(engine: EngineModule, asset: ResolvedAsset): void {
  if (asset.kind === "texture") {
    engine.set_asset_texture(asset.id, asset.width, asset.height, asset.rgba);
    return;
  }
  if (asset.vertices.length > 0) {
    engine.set_asset_mesh(asset.id, asset.vertices, asset.indices, asset.normals, asset.uvs);
  }
  if (asset.points && !engine.set_asset_points(asset.id, asset.points)) {
    throw new Error("Model point data was rejected by the engine.");
  }
}
