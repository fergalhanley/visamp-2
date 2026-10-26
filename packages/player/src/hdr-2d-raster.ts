import type { HdrCommand, Rgba } from "./hdr-2d-frame";
import type { ResolvedAsset } from "./types";

function css(c: Rgba): string {
  return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3].toFixed(3)})`;
}
/** Browser rasterisation of one paint operation, before HDR intensity/compositing. */
export class HdrRasterizer {
  readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLCanvasElement>();
  constructor(private readonly assets: readonly ResolvedAsset[]) {
    const ctx = this.canvas.getContext("2d", { colorSpace: "srgb" });
    if (!ctx) throw new Error("Could not create HDR paint rasterizer");
    this.ctx = ctx;
  }
  private image(id: string): HTMLCanvasElement {
    const cached = this.images.get(id);
    if (cached) return cached;
    const a = this.assets.find(a => a.id === id && a.kind === "texture");
    if (!a || a.kind !== "texture") throw new Error(`HDR texture is not loaded: ${id}`);
    const canvas = document.createElement("canvas");
    canvas.width = a.width; canvas.height = a.height;
    const ctx = canvas.getContext("2d", { colorSpace: "srgb" });
    if (!ctx) throw new Error("Could not create HDR image rasterizer");
    ctx.putImageData(new ImageData(new Uint8ClampedArray(a.rgba), a.width, a.height), 0, 0);
    this.images.set(id, canvas);
    return canvas;
  }
  draw(c: Exclude<HdrCommand, { kind: "clear" }>, width: number, height: number): HTMLCanvasElement {
    const ctx = this.ctx;
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    ctx.resetTransform(); ctx.clearRect(0, 0, width, height);
    ctx.save();
    try {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (c.kind !== "background") ctx.setTransform(...c.transform);
      if (c.kind === "path") {
        ctx.translate(...c.pivot); ctx.rotate(c.rotation); ctx.translate(-c.pivot[0], -c.pivot[1]);
      }
      let paint: string | CanvasGradient = css(c.color);
      if (c.gradient) {
        const g = c.gradient;
        const gradient = g.radius === null ? ctx.createLinearGradient(...g.axis)
          : ctx.createRadialGradient(g.axis[0], g.axis[1], 0, g.axis[0], g.axis[1], g.radius);
        for (const [offset, color] of g.stops) gradient.addColorStop(offset, css(color));
        paint = gradient;
      }
      ctx.fillStyle = paint; ctx.strokeStyle = paint;
      if (c.kind === "background") ctx.fillRect(0, 0, width, height);
      else if (c.kind === "text") { ctx.font = c.font; ctx.fillText(c.text, ...c.position); }
      else if (c.kind === "image") { ctx.globalAlpha = c.opacity; ctx.drawImage(this.image(c.asset), ...c.rect); }
      else {
        ctx.beginPath();
        const first = c.points[0];
        if (first) {
          ctx.moveTo(...first);
          for (let i = 1; i < c.points.length; i++) ctx.lineTo(...c.points[i]!);
          if (c.closed) ctx.closePath();
          if (c.stroke) {
            ctx.lineWidth = c.stroke.width; ctx.lineCap = c.stroke.cap; ctx.lineJoin = c.stroke.join; ctx.stroke();
          } else ctx.fill();
        }
      }
    } finally { ctx.restore(); }
    return this.canvas;
  }
  dispose(): void { this.images.clear(); this.canvas.width = this.canvas.height = 1; }
}
