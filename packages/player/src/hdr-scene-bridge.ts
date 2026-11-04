import type { HdrScene } from "./webgpu-hdr-renderer";

/** Minimal export required from a rebuilt @visamp/engine WASM package. */
export interface HdrSceneSource {
  get_hdr_scene_snapshot(): string;
}

/**
 * A narrow, explicit boundary between Rust's scene recorder and WebGPU.
 * Not enabled in the player yet; callers must create a separate canvas.
 * Throws on old WASM packages or unsupported 3D features.
 */
export function readHdrScene(source: HdrSceneSource): HdrScene {
  if (typeof source.get_hdr_scene_snapshot !== "function") {
    throw new Error("This WASM engine does not expose HDR scene snapshots; rebuild @visamp/engine");
  }
  const parsed: unknown = JSON.parse(source.get_hdr_scene_snapshot());
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid HDR scene snapshot");
  }
  const value = parsed as Record<string, unknown>;
  const rgba = (input: unknown, count: number): number[] => {
    if (!Array.isArray(input) || input.length !== count ||
      !input.every((x) => typeof x === "number" && Number.isFinite(x))) {
      throw new Error("Invalid HDR scene numeric data");
    }
    return input as number[];
  };
  const clear = rgba(value.clear, 4) as unknown as HdrScene["clear"];
  if (!Array.isArray(value.triangles) || value.triangles.length > 16384) {
    throw new Error("Invalid HDR scene triangle count");
  }
  const triangles = value.triangles.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid HDR triangle");
    const triangle = entry as Record<string, unknown>;
    return {
      vertices: rgba(triangle.vertices, 6) as unknown as HdrScene["triangles"][number]["vertices"],
      color: rgba(triangle.color, 4) as unknown as HdrScene["triangles"][number]["color"],
    };
  });
  return { clear, triangles };
}
