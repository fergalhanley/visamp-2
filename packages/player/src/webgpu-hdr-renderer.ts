/// <reference types="@webgpu/types" />
/**
 * Experimental WebGPU scene renderer. Runs independently of the existing WASM
 * canvas and deliberately supports only clear + unlit flat-colour triangles.
 * Coordinates are in normalized device space (x/y -1..1).
 *
 * The integration layer will translate Rust Scene commands to these triangles.
 * Unsupported geometry must never silently disappear in production playback.
 */
export type HdrTriangle = {
  vertices: readonly [number, number, number, number, number, number];
  color: readonly [number, number, number, number];
};
export type HdrScene = {
  clear: readonly [number, number, number, number];
  triangles: readonly HdrTriangle[];
};
export type HdrRenderMode = "extended" | "standard";

const SHADER = `
struct Varying {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
}
@vertex fn vs(
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
) -> Varying {
  var out: Varying;
  out.position = vec4f(pos, 0.0, 1.0);
  out.color = color;
  return out;
}
@fragment fn fs(in: Varying) -> @location(0) vec4f {
  return in.color;
}
`;

export function packHdrTriangles(scene: HdrScene, intensity = 1): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(intensity) || intensity < 0.5 || intensity > 6) {
    throw new Error("HDR intensity must be between 0.5 and 6");
  }
  const result = new Float32Array(scene.triangles.length * 18);
  let offset = 0;
  for (const triangle of scene.triangles) {
    if (triangle.vertices.some((v) => !Number.isFinite(v)) ||
        triangle.color.some((v) => !Number.isFinite(v) || v < 0)) {
      throw new Error("HDR scene contains invalid vertex or colour values");
    }
    for (const [x, y] of [[0, 1], [2, 3], [4, 5]] as const) {
      result[offset++] = triangle.vertices[x];
      result[offset++] = triangle.vertices[y];
      result.set([triangle.color[0] * intensity, triangle.color[1] * intensity, triangle.color[2] * intensity, triangle.color[3]], offset);
      offset += 4;
    }
  }
  return result;
}

export class HdrSceneRenderer {
  private constructor(
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly pipeline: GPURenderPipeline,
    private readonly canvas: HTMLCanvasElement,
    readonly mode: HdrRenderMode,
  ) {}

  static async create(canvas: HTMLCanvasElement, mode: HdrRenderMode = "extended"): Promise<HdrSceneRenderer> {
    if (!navigator.gpu) throw new Error("WebGPU is not available");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter available");
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      device.destroy();
      throw new Error("Could not obtain WebGPU canvas context");
    }
    try {
      context.configure({
        device,
        format: "rgba16float",
        alphaMode: "opaque",
        colorSpace: "display-p3",
        toneMapping: { mode },
      });
      const shader = device.createShaderModule({ code: SHADER });
      const info = await shader.getCompilationInfo();
      const errors = info.messages.filter((message) => message.type === "error");
      if (errors.length) throw new Error(errors.map((message) => message.message).join("; "));
      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
          module: shader,
          entryPoint: "vs",
          buffers: [{
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x4" },
            ],
          }],
        },
        fragment: {
          module: shader,
          entryPoint: "fs",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list", cullMode: "none" },
      });
      return new HdrSceneRenderer(device, context, pipeline, canvas, mode);
    } catch (error) {
      context.unconfigure();
      device.destroy();
      throw error;
    }
  }

  render(scene: HdrScene, intensity = 1): void {
    if (scene.clear.length !== 4 || scene.clear.some((v) => !Number.isFinite(v) || v < 0)) {
      throw new Error("HDR scene contains an invalid clear colour");
    }
    const vertices = packHdrTriangles(scene, intensity);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * (window.devicePixelRatio || 1)));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * (window.devicePixelRatio || 1)));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    let buffer: GPUBuffer | undefined;
    try {
      if (vertices.length) {
        buffer = this.device.createBuffer({
          size: vertices.byteLength,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(buffer, 0, vertices);
      }
      const encoder = this.device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: {
            r: scene.clear[0], g: scene.clear[1],
            b: scene.clear[2], a: scene.clear[3],
          },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      if (buffer) {
        pass.setPipeline(this.pipeline);
        pass.setVertexBuffer(0, buffer);
        pass.draw(vertices.length / 6);
      }
      pass.end();
      this.device.queue.submit([encoder.finish()]);
    } finally {
      // GPU resources remain valid until queued work completes after destroy.
      buffer?.destroy();
    }
  }

  dispose(): void {
    this.context.unconfigure();
    this.device.destroy();
  }
}
