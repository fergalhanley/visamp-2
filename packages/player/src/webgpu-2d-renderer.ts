/// <reference types="@webgpu/types" />
import type { HdrEffect, HdrFrame, Rgba } from "./hdr-2d-frame";
import { HdrGeometryBatch, GEOMETRY_SHADER, INSTANCE_FLOATS } from "./hdr-2d-batch";
import { HdrRasterizer } from "./hdr-2d-raster";
import { COMPOSITE, EFFECTS, SCRAMBLE } from "./hdr-2d-shaders";
import { SCRAMBLE_PRESETS, scrambleAddressMap } from "./hdr-2d-scramble";
import type { ResolvedAsset } from "./types";

type Target = { texture: GPUTexture; width: number; height: number };
type Options = { assets?: readonly ResolvedAsset[]; signal?: AbortSignal; onError?: (error: Error) => void };
const owners = new WeakMap<HTMLCanvasElement, WebGpu2DRenderer>();
const BLEND = { alpha: 0, additive: 1, multiply: 2, none: 3 } as const;

/** Batched geometry and browser paint fallbacks with linear-light HDR effects. */
export class WebGpu2DRenderer {
  private disposed = false;
  private failure: Error | undefined;
  private readonly raster: HdrRasterizer;
  private readonly batch = new HdrGeometryBatch();
  private vertexBuffer: GPUBuffer | undefined;
  private vertexCapacity = 0;
  private readonly geometryUniform: GPUBuffer;
  private readonly geometryGroup: GPUBindGroup;
  private readonly uniform: GPUBuffer;
  private readonly sampler: GPUSampler;
  private map: GPUBuffer;
  private mapKey = "";
  private readonly maps = new Map<string, GPUTexture>();
  private scene: Target[] = [];
  private history: Target[] = [];
  private pool: Target[] = [];
  private paint: Target | undefined;
  private current = 0;
  private historyIndex = 0;
  private scrambleActive = false;
  private refreshRemainder = 0;
  private sequence = -1;
  private output: GPUTexture | undefined;
  private width = 0;
  private height = 0;
  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly context: GPUCanvasContext,
    private readonly device: GPUDevice,
    private readonly layout: GPUBindGroupLayout,
    private readonly pipelines: { composite: GPURenderPipeline; effects: GPURenderPipeline; scramble: GPURenderPipeline },
    private readonly options: Options,
    private readonly geometryPipeline: GPURenderPipeline,
  ) {
    this.raster = new HdrRasterizer(options.assets ?? []);
    this.geometryUniform = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.geometryGroup = device.createBindGroup({ layout: geometryPipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.geometryUniform } },
    ] });
    this.uniform = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.map = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ minFilter: "linear", magFilter: "linear" });
    device.addEventListener("uncapturederror", this.onGpuError);
    void device.lost.then(info => {
      if (!this.disposed) this.fail(new Error(`HDR device lost: ${info.message || info.reason}`));
    });
  }
  private onGpuError = (event: GPUUncapturedErrorEvent) => { this.fail(new Error(event.error.message)); };
  private fail(error: Error): void {
    if (this.disposed || this.failure) return;
    this.failure = error;
    this.options.onError?.(error);
  }
  static async create(canvas: HTMLCanvasElement, options: Options = {}): Promise<WebGpu2DRenderer> {
    if (!navigator.gpu) throw new Error("WebGPU is not available");
    const abort = () => options.signal?.throwIfAborted();
    abort();
    const adapter = await navigator.gpu.requestAdapter(); abort();
    if (!adapter) throw new Error("No WebGPU adapter available");
    const device = await adapter.requestDevice();
    let renderer: WebGpu2DRenderer | undefined;
    try {
      abort();
      device.pushErrorScope("validation");
      const layout = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      ] });
      const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
      const createPipeline = async (code: string) => {
        const module = device.createShaderModule({ code });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(m => m.type === "error");
        if (errors.length) throw new Error(errors.map(m => m.message).join("; "));
        return device.createRenderPipelineAsync({
          layout: pipelineLayout,
          vertex: { module, entryPoint: "vs" },
          fragment: { module, entryPoint: "fs", targets: [{ format: "rgba16float" }] },
          primitive: { topology: "triangle-list" },
        });
      };
      const [composite, effects, scramble] = await Promise.all([COMPOSITE, EFFECTS, SCRAMBLE].map(createPipeline));
      const geometryModule = device.createShaderModule({ code: GEOMETRY_SHADER });
      const geometryPipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: { module: geometryModule, entryPoint: "vs", buffers: [{
          arrayStride: INSTANCE_FLOATS * 4, stepMode: "instance", attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32x2" },
            { shaderLocation: 3, offset: 24, format: "float32x2" },
            { shaderLocation: 4, offset: 32, format: "float32x4" },
            { shaderLocation: 5, offset: 48, format: "float32x2" },
          ],
        }] },
        fragment: { module: geometryModule, entryPoint: "fs", targets: [{ format: "rgba16float", blend: {
          color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
        } }] },
        primitive: { topology: "triangle-list" },
      });
      const error = await device.popErrorScope();
      if (error) throw new Error(error.message);
      abort();
      if (!composite || !effects || !scramble) throw new Error("HDR pipelines unavailable");
      const context = canvas.getContext("webgpu");
      if (!context) throw new Error("Could not obtain WebGPU canvas context");
      renderer = new WebGpu2DRenderer(canvas, context, device, layout, { composite, effects, scramble }, options, geometryPipeline);
      // Configure only after asynchronous setup, and only if this activation is current.
      owners.get(canvas)?.dispose();
      owners.set(canvas, renderer);
      context.configure({ device, format: "rgba16float", colorSpace: "srgb", alphaMode: "premultiplied", toneMapping: { mode: "extended" } });
      return renderer;
    } catch (error) {
      renderer?.dispose();
      device.destroy();
      throw error;
    }
  }
  private target(width: number, height: number, format: GPUTextureFormat = "rgba16float"): Target {
    return { width, height, texture: this.device.createTexture({
      size: [width, height], format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST,
    }) };
  }
  private temporary(width: number, height: number, avoid: readonly GPUTexture[]): Target {
    const existing = this.pool.find(t => t.width === width && t.height === height && !avoid.includes(t.texture));
    if (existing) return existing;
    const t = this.target(width, height); this.pool.push(t); return t;
  }
  private clear(target: Target): void {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target.texture.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
    pass.end(); this.device.queue.submit([encoder.finish()]);
  }
  private reset(width: number, height: number): void {
    const limit = this.device.limits.maxTextureDimension2D;
    // Bound persistent float scene/history/effect memory independently of device limits.
    if (width > limit || height > limit || width * height > 16_777_216) throw new Error("HDR canvas exceeds texture budget");
    for (const t of [...this.scene, ...this.history, ...this.pool]) t.texture.destroy();
    this.paint?.texture.destroy();
    this.width = width; this.height = height;
    this.canvas.width = width; this.canvas.height = height;
    this.scene = [this.target(width, height), this.target(width, height)];
    this.history = [this.target(width, height), this.target(width, height)];
    this.paint = this.target(width, height, "rgba8unorm");
    this.pool = []; this.current = 0; this.historyIndex = 0;
    this.sequence = -1; this.output = undefined; this.scrambleActive = false; this.refreshRemainder = 0;
    this.mapKey = "";
    for (const t of [...this.scene, ...this.history]) this.clear(t);
  }
  private flushGeometry(): void {
    if (!this.batch.count) return;
    const vertices = this.batch.data.subarray(0, this.batch.count * INSTANCE_FLOATS);
    if (vertices.byteLength > this.vertexCapacity) {
      this.vertexBuffer?.destroy();
      this.vertexCapacity = this.batch.data.byteLength;
      this.vertexBuffer = this.device.createBuffer({ size: this.vertexCapacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    this.device.queue.writeBuffer(this.vertexBuffer!, 0, vertices);
    this.device.queue.writeBuffer(this.geometryUniform, 0, new Float32Array([this.width, this.height, 0, 0]));
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{
      view: this.scene[this.current]!.texture.createView(), loadOp: "load", storeOp: "store",
    }] });
    pass.setPipeline(this.geometryPipeline); pass.setBindGroup(0, this.geometryGroup);
    pass.setVertexBuffer(0, this.vertexBuffer!); pass.draw(6, this.batch.count); pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.batch.reset();
  }
  private draw(
    pipeline: GPURenderPipeline, source: GPUTexture, destination: Target | GPUTexture,
    kind = 0, amount = 0, effect?: HdrEffect,
    auxiliary = source, extra: readonly number[] = [0, 0, 0, 0], color?: Rgba,
  ): GPUTexture {
    const target = "texture" in destination ? destination.texture : destination;
    const width = "texture" in destination ? destination.width : this.width;
    const height = "texture" in destination ? destination.height : this.height;
    const data = new Float32Array(20);
    data.set([kind, amount, width, height]);
    data.set(effect?.params ?? [0, 0, 0, 0, 0, 0, 0, 0], 4);
    data.set(color ?? effect?.color ?? [0, 0, 0, 0], 12);
    data.set(extra, 16);
    this.device.queue.writeBuffer(this.uniform, 0, data);
    const group = this.device.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: source.createView() }, { binding: 1, resource: auxiliary.createView() },
      { binding: 2, resource: this.sampler }, { binding: 3, resource: { buffer: this.uniform } },
      { binding: 4, resource: { buffer: this.map } },
    ] });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 0] }] });
    pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3); pass.end();
    // Submit before reusing the paint texture/uniform. Queue ordering preserves every draw.
    this.device.queue.submit([encoder.finish()]);
    return target;
  }
  private blur(source: GPUTexture, amount: number, avoid: readonly GPUTexture[] = []): GPUTexture {
    if (amount <= 0.001) return source;
    let w = this.width, h = this.height;
    let current = source;
    const sizes: [number, number][] = [];
    while (amount * Math.max(w / this.width, h / this.height) > 8 && (w > 1 || h > 1)) {
      sizes.push([w, h]); w = Math.ceil(w / 2); h = Math.ceil(h / 2);
      current = this.draw(this.pipelines.effects, current, this.temporary(w, h, [current, ...avoid]));
    }
    current = this.draw(this.pipelines.effects, current, this.temporary(w, h, [current, ...avoid]), 9, amount * w / this.width, undefined, current, [1, 0, 0, 0]);
    current = this.draw(this.pipelines.effects, current, this.temporary(w, h, [current, ...avoid]), 9, amount * h / this.height, undefined, current, [0, 1, 0, 0]);
    for (const [width, height] of sizes.reverse()) current = this.draw(this.pipelines.effects, current, this.temporary(width, height, [current, ...avoid]));
    return current;
  }
  private displacement(id: string): GPUTexture {
    const cached = this.maps.get(id); if (cached) return cached;
    const asset = this.options.assets?.find(a => a.id === id && a.kind === "texture");
    if (!asset || asset.kind !== "texture") throw new Error(`HDR displacement texture is not loaded: ${id}`);
    if (asset.width > this.device.limits.maxTextureDimension2D || asset.height > this.device.limits.maxTextureDimension2D) throw new Error("HDR displacement texture exceeds GPU dimensions");
    const target = this.target(asset.width, asset.height, "rgba8unorm");
    this.device.queue.writeTexture({ texture: target.texture }, new Uint8Array(asset.rgba), { bytesPerRow: asset.width * 4 }, [asset.width, asset.height]);
    this.maps.set(id, target.texture); return target.texture;
  }
  private effects(source: GPUTexture, effects: readonly HdrEffect[]): GPUTexture {
    let current = source;
    const used = new Set(effects.flatMap(e => e.asset ? [e.asset] : []));
    for (const [id, texture] of this.maps) if (!used.has(id)) { texture.destroy(); this.maps.delete(id); }
    for (const e of effects) {
      if (e.kind === 9) current = this.blur(current, e.amount);
      else if (e.kind === 25) {
        if (e.params[0] === 0) continue;
        const base = current;
        current = this.draw(this.pipelines.effects, current, this.temporary(this.width, this.height, [current]), 27, e.amount);
        current = this.blur(current, e.params[1]!, [base]);
        current = this.draw(this.pipelines.effects, current, this.temporary(this.width, this.height, [base, current]), 28, e.params[0]!, undefined, base);
      } else {
        const aux = e.asset ? this.displacement(e.asset) : current;
        current = this.draw(this.pipelines.effects, current, this.temporary(this.width, this.height, [current, aux]), e.kind, e.amount, e, aux);
      }
    }
    return current;
  }
  private feedback(source: GPUTexture, frame: HdrFrame): GPUTexture {
    const effect = frame.scramble;
    if (!effect) { this.scrambleActive = false; return source; }
    let ticks = 1;
    if (!this.scrambleActive) {
      this.refreshRemainder = 0;
      for (const t of this.history) this.clear(t);
    } else {
      const elapsed = this.refreshRemainder + frame.seconds * 60;
      ticks = Math.min(256, Math.floor(elapsed + 1e-8));
      this.refreshRemainder = Math.max(0, elapsed - Math.floor(elapsed + 1e-8));
    }
    const [r, g, b, alpha] = effect.refresh;
    const refresh: Rgba = [r, g, b, alpha >= 1 ? 1 : 1 - Math.pow(1 - alpha, ticks)];
    const composite = this.temporary(this.width, this.height, []);
    this.draw(this.pipelines.composite, source, composite, 3, 0, undefined, this.history[this.historyIndex]!.texture, undefined, refresh);
    if (this.width < 27 && effect.kind <= 17) {
      const key = `${this.width}:${this.height}:${effect.kind}`;
      if (key !== this.mapKey) {
        const addresses = scrambleAddressMap(this.width, this.height, effect.kind);
        this.map.destroy();
        this.map = this.device.createBuffer({ size: addresses.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
        this.device.queue.writeBuffer(this.map, 0, addresses); this.mapKey = key;
      }
    }
    const preset = SCRAMBLE_PRESETS[effect.kind - 1];
    const params = preset ? [...preset, 0, 0, 0] : new Array<number>(8).fill(0);
    const data: HdrEffect = { kind: effect.kind, amount: 0, params, color: [0, 0, 0, 0], asset: null };
    this.historyIndex = 1 - this.historyIndex;
    this.scrambleActive = true;
    return this.draw(this.pipelines.scramble, composite.texture, this.history[this.historyIndex]!, effect.kind, 0, data);
  }
  /** Returns false until the engine has produced its first complete frame. */
  render(frame: HdrFrame, intensity = 1): boolean {
    if (this.disposed) throw new Error("HDR renderer is disposed");
    if (this.failure) throw this.failure;
    if (!Number.isFinite(intensity) || intensity < 0.5 || intensity > 6) throw new Error("HDR preview intensity must be between 0.5 and 6");
    if (frame.sequence === 0) return false;
    if (frame.width !== this.width || frame.height !== this.height || frame.sequence < this.sequence) this.reset(frame.width, frame.height);
    if (frame.sequence !== this.sequence) {
      this.batch.reset();
      if (frame.clearScene) this.clear(this.scene[this.current]!);
      for (const command of frame.commands) {
        if (command.kind === "clear") { this.flushGeometry(); this.clear(this.scene[this.current]!); continue; }
        if (command.kind === "path" && command.points.length === 0 || command.kind === "text" && command.text.length === 0) continue;
        if (this.batch.append(command, this.width, this.height)) continue;
        this.flushGeometry();
        const canvas = this.raster.draw(command, this.width, this.height);
        this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture: this.paint!.texture, premultipliedAlpha: false, colorSpace: "srgb" }, [this.width, this.height]);
        const previous = this.scene[this.current]!.texture;
        this.current = 1 - this.current;
        this.draw(this.pipelines.composite, this.paint!.texture, this.scene[this.current]!, 1, 0, undefined, previous, [0, 0, BLEND[command.blend], command.intensity]);
      }
      this.flushGeometry();
      const feedback = this.feedback(this.scene[this.current]!.texture, frame);
      this.output = this.effects(feedback, frame.effects);
      this.sequence = frame.sequence;
    }
    if (!this.output) return false;
    this.draw(this.pipelines.composite, this.output, this.context.getCurrentTexture(), 2, intensity);
    return true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (owners.get(this.canvas) === this) { owners.delete(this.canvas); this.context.unconfigure(); }
    this.device.removeEventListener("uncapturederror", this.onGpuError);
    for (const t of [...this.scene, ...this.history, ...this.pool]) t.texture.destroy();
    for (const t of this.maps.values()) t.destroy();
    this.vertexBuffer?.destroy(); this.geometryUniform.destroy();
    this.paint?.texture.destroy(); this.uniform.destroy(); this.map.destroy(); this.raster.dispose();
    this.device.destroy();
  }
}
