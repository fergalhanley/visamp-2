import type { EngineModule } from "./types";
import { tessellateHdr2D, type Hdr2DFrame } from "./hdr-2d-geometry";

/** Decode the live Rust 2D recorder, rejecting partial or malformed frames. */
export function readHdr2DScene(engine: Pick<EngineModule, "get_hdr_2d_snapshot">) {
  const frame: unknown = JSON.parse(engine.get_hdr_2d_snapshot());
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new Error("Invalid HDR 2D frame");
  const record = frame as Record<string, unknown>;
  const width = record.width;
  const height = record.height;
  const clear = record.clear;
  const shapes = record.shapes;
  if (typeof width !== "number" || typeof height !== "number" ||
      !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
      !Array.isArray(clear) || clear.length !== 4 ||
      !clear.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) ||
      !Array.isArray(shapes)) throw new Error("Invalid HDR 2D frame structure");
  for (const item of shapes) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid HDR 2D shape");
    const shape = item as Record<string, unknown>;
    if (!["rect", "circle"].includes(String(shape.kind)) ||
        !Array.isArray(shape.color) || shape.color.length !== 4 ||
        !shape.color.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) ||
        typeof shape.x !== "number" || typeof shape.y !== "number") {
      throw new Error("Invalid HDR 2D shape");
    }
  }
  return tessellateHdr2D({
    width, height, clear: [clear[0], clear[1], clear[2], clear[3]],
    shapes: shapes as unknown as Hdr2DFrame["shapes"],
  });
}
