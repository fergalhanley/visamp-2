import type { HdrCommand } from "./hdr-2d-frame";

/** One affine rectangle per instance: lines are narrow rectangles, not canvases.
 * Other paints remain ordered raster fallbacks until they have equivalent geometry.
 * Floats: origin.xy, xAxis.xy, yAxis.xy, size.xy, premultiplied linear RGBA,
 * local units per physical pixel.xy. Each instance occupies 56 bytes.
 */
export const INSTANCE_FLOATS = 14;
function linear(c: number): number {
  // Match the base sRGB colour used by the browser paint rasterizer.
  const v = Math.round(c * 255) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
export class HdrGeometryBatch {
  data = new Float32Array(128 * INSTANCE_FLOATS);
  count = 0;
  reset(): void { this.count = 0; }
  append(c: HdrCommand, width: number, height: number): boolean {
    if (c.kind === "clear" || c.gradient || c.blend !== "alpha") return false;
    let ox = 0, oy = 0, ux = 1, uy = 0, vx = 0, vy = 1, w = width, h = height;
    if (c.kind === "path") {
      const p = c.points;
      const a = p[0], b = p[1];
      if (!a || !b) return false;
      if (c.stroke ? p.length !== 2 || c.closed || c.stroke.cap === "round" : !c.closed || p.length !== 4) return false;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      w = Math.hypot(dx, dy);
      if (w === 0) return c.stroke?.cap === "butt";
      ux = dx / w; uy = dy / w;
      ox = a[0]; oy = a[1];
      if (c.stroke) {
        vx = -uy; vy = ux; h = c.stroke.width;
        ox -= vx * h / 2; oy -= vy * h / 2;
        if (c.stroke.cap === "square") { ox -= ux * h / 2; oy -= uy * h / 2; w += h; }
      } else {
        // Accept rectangles regardless of their local rotation or winding. A
        // concave polygon, rounded rect or skewed quadrilateral must fall back.
        const corner = p[2]!, d = p[3]!;
        vx = d[0] - a[0]; vy = d[1] - a[1]; h = Math.hypot(vx, vy);
        if (h === 0) return false;
        if (Math.abs(ux * vx + uy * vy) > h * 1e-7 ||
            Math.hypot(corner[0] - (b[0] + d[0] - a[0]), corner[1] - (b[1] + d[1] - a[1])) > Math.max(w, h) * 1e-7) return false;
        vx /= h; vy /= h;
      }
      const cos = Math.cos(c.rotation), sin = Math.sin(c.rotation);
      const [a0, a1, a2, a3, tx, ty] = c.transform;
      const m0 = a0 * cos + a2 * sin, m1 = a1 * cos + a3 * sin;
      const m2 = -a0 * sin + a2 * cos, m3 = -a1 * sin + a3 * cos;
      const [px, py] = c.pivot;
      const x = ox - px, y = oy - py;
      ox = m0 * x + m2 * y + a0 * px + a2 * py + tx;
      oy = m1 * x + m3 * y + a1 * px + a3 * py + ty;
      const x0 = m0 * ux + m2 * uy, x1 = m1 * ux + m3 * uy;
      const y0 = m0 * vx + m2 * vy, y1 = m1 * vx + m3 * vy;
      ux = x0; uy = x1; vx = y0; vy = y1;
    } else if (c.kind !== "background") return false;
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-12) return false;
    const pixelX = Math.hypot(vy, vx) / Math.abs(det);
    const pixelY = Math.hypot(uy, ux) / Math.abs(det);
    if (![ox, oy, ux, uy, vx, vy, w, h, pixelX, pixelY].every(v => Number.isFinite(v) && Math.abs(v) < 1e30)) return false;
    const offset = this.count * INSTANCE_FLOATS;
    if (offset + INSTANCE_FLOATS > this.data.length) {
      const grown = new Float32Array(this.data.length * 2); grown.set(this.data); this.data = grown;
    }
    const alpha = c.color[3];
    this.data.set([ox, oy, ux, uy, vx, vy, w, h,
      linear(c.color[0]) * c.intensity * alpha,
      linear(c.color[1]) * c.intensity * alpha,
      linear(c.color[2]) * c.intensity * alpha, alpha, pixelX, pixelY], offset);
    this.count++;
    return true;
  }
}

/** Analytic coverage preserves subpixel strokes (including the user's zoomed
 * lines below one pixel), without a full-size MSAA surface or per-line pass.
 */
export const GEOMETRY_SHADER = /* wgsl */ `
@group(0) @binding(0) var<uniform> viewport: vec4f;
struct Vertex {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) @interpolate(flat) size: vec2f,
  @location(2) @interpolate(flat) pixel: vec2f,
  @location(3) @interpolate(flat) color: vec4f,
}
@vertex fn vs(
  @builtin(vertex_index) vertex: u32,
  @location(0) origin: vec2f,
  @location(1) axisX: vec2f,
  @location(2) axisY: vec2f,
  @location(3) size: vec2f,
  @location(4) color: vec4f,
  @location(5) pixel: vec2f,
) -> Vertex {
  let corners = array<vec2f,6>(vec2f(0,0),vec2f(1,0),vec2f(0,1),vec2f(0,1),vec2f(1,0),vec2f(1,1));
  let local = corners[vertex] * (size + 2*pixel) - pixel;
  let world = origin + axisX*local.x + axisY*local.y;
  var out: Vertex;
  out.position = vec4f(world.x/viewport.x*2-1,1-world.y/viewport.y*2,0,1);
  out.local = local; out.size = size; out.pixel = pixel; out.color = color;
  return out;
}
@fragment fn fs(in: Vertex) -> @location(0) vec4f {
  // Integrate the box over one pixel footprint. A 0.2px-wide line retains
  // fractional coverage, instead of disappearing or becoming a 1px line.
  let lo = max(in.local-in.pixel*0.5,vec2f(0));
  let hi = min(in.local+in.pixel*0.5,in.size);
  let coverage = clamp((hi-lo)/in.pixel,vec2f(0),vec2f(1));
  return in.color * coverage.x * coverage.y;
}
`;
