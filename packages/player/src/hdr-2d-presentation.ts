import type { HdrScene } from "./webgpu-hdr-renderer";

/** The SDR canvas stays visible until an actual extended-range frame is ready. */
export function shouldPresentHdr2D(scene: HdrScene): boolean {
  return scene.triangles.length > 0 && scene.triangles.some(triangle =>
    triangle.color.slice(0, 3).some(channel => Number.isFinite(channel) && channel > 1)
  );
}
