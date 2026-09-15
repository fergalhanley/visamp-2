import { describe, expect, it, vi } from "vitest";
import { registerAsset } from "../assets";
import type { EngineModule, ResolvedAsset } from "../types";

const model = (triangles = false): Extract<ResolvedAsset, { kind: "mesh" }> => ({
  id: "skull", kind: "mesh", points: new Float32Array([1, 2, 3]),
  vertices: new Float32Array(triangles ? [1, 2, 3] : []),
  indices: new Uint32Array(), normals: new Float32Array(), uvs: new Float32Array(),
});
const host = () => ({
  set_asset_texture: vi.fn(() => true), set_asset_mesh: vi.fn(() => true),
  set_asset_points: vi.fn(() => true),
});

describe("resolved model registration", () => {
  it("hands point-only geometry to the point API without registering an empty mesh", () => {
    const engine = host(), asset = model();
    registerAsset(engine as unknown as EngineModule, asset);
    expect(engine.set_asset_mesh).not.toHaveBeenCalled();
    expect(engine.set_asset_points).toHaveBeenCalledWith(asset.id, asset.points);
  });
  it("registers both representations for triangle models", () => {
    const engine = host();
    registerAsset(engine as unknown as EngineModule, model(true));
    expect(engine.set_asset_mesh).toHaveBeenCalledOnce();
    expect(engine.set_asset_points).toHaveBeenCalledOnce();
  });
  it("reports point data rejected by the engine", () => {
    const engine = host();
    engine.set_asset_points.mockReturnValue(false);
    expect(() => registerAsset(engine as unknown as EngineModule, model())).toThrow("rejected");
  });
});
