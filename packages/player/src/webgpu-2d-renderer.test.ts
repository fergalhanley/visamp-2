import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WebGpu2DRenderer } from "./webgpu-2d-renderer";
import { decodeHdrFrame, type HdrFrame } from "./hdr-2d-frame";
import { scrambleAddressMap } from "./hdr-2d-scramble";

const paint = { transform: [1, 0, 0, 1, 0, 0], color: [1, 0.5, 0, 0.5], gradient: null, blend: "alpha", intensity: 4 } as const;
function frame(sequence = 1): HdrFrame {
  return decodeHdrFrame({ version: 2, sequence, width: 64, height: 32, seconds: 1 / 60, clearScene: false, effects: [], scramble: null,
    commands: [{ ...paint, kind: "path", points: [[0, 0], [20, 0], [20, 20]], closed: true, pivot: [10, 10], rotation: 0.7, stroke: null }] });
}
let records: number[][];
let passes: { load: string; draws: number[][] }[];
let textures: { destroyed: boolean; format: string; createView(): unknown; destroy(): void }[];
let ctx: Record<string, ReturnType<typeof vi.fn>>;
let device: Record<string, any>;
let canvas: HTMLCanvasElement;
let lost: (value: { reason: string; message: string }) => void;
let onGpuError: (event: { error: Error }) => void;
beforeEach(() => {
  records = []; textures = []; passes = [];
  const texture = (format = "rgba16float") => {
    const t = { destroyed: false, format, createView: () => ({ texture: t }), destroy: vi.fn(() => { t.destroyed = true; }) };
    textures.push(t); return t;
  };
  const context = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: vi.fn(() => texture()) };
  canvas = { width: 0, height: 0, getContext: vi.fn(() => context) } as unknown as HTMLCanvasElement;
  ctx = Object.fromEntries(["resetTransform", "clearRect", "save", "restore", "setTransform", "translate", "rotate", "beginPath", "moveTo", "lineTo", "closePath", "stroke", "fill", "fillText", "fillRect", "drawImage", "putImageData", "createLinearGradient", "createRadialGradient"].map(name => [name, vi.fn()]));
  ctx.createLinearGradient!.mockReturnValue({ addColorStop: vi.fn() });
  ctx.createRadialGradient!.mockReturnValue({ addColorStop: vi.fn() });
  vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  vi.stubGlobal("GPUBufferUsage", { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8 });
  vi.stubGlobal("GPUTextureUsage", { TEXTURE_BINDING: 1, RENDER_ATTACHMENT: 2, COPY_DST: 4 });
  vi.stubGlobal("GPUShaderStage", { FRAGMENT: 2 });
  const layout = {};
  device = {
    limits: { maxTextureDimension2D: 8192 },
    pushErrorScope: vi.fn(), popErrorScope: vi.fn(async () => null),
    createShaderModule: vi.fn(() => ({ getCompilationInfo: async () => ({ messages: [] }) })),
    createRenderPipelineAsync: vi.fn(async () => ({ getBindGroupLayout: () => ({}) })), createBindGroupLayout: vi.fn(() => layout), createPipelineLayout: vi.fn(() => ({})),
    createBuffer: vi.fn(() => ({ destroy: vi.fn() })), createSampler: vi.fn(() => ({})),
    createTexture: vi.fn(({ format }) => texture(format)),
    createBindGroup: vi.fn((descriptor) => descriptor),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: ({ colorAttachments }: any) => {
        const record = { load: colorAttachments[0].loadOp, draws: [] as number[][] }; passes.push(record);
        return {
        setPipeline() {},
        setBindGroup: (_index: number, group: any) => {
          // Catch the most consequential ping-pong mistake: reading and writing a texture in one pass.
          const destination = colorAttachments[0].view.texture;
          for (const binding of group.entries) if (binding.resource.texture) expect(binding.resource.texture).not.toBe(destination);
        }, setVertexBuffer() {}, draw(...args: number[]) { record.draws.push(args); }, end() {},
      }; }, finish() { return {}; },
    })),
    queue: { writeBuffer: vi.fn((_buffer, _offset, data) => { if (data instanceof Float32Array) records.push([...data]); }),
      writeTexture: vi.fn(), copyExternalImageToTexture: vi.fn(), submit: vi.fn() },
    destroy: vi.fn(), addEventListener: vi.fn((_name, cb) => { onGpuError = cb; }), removeEventListener: vi.fn(),
    lost: new Promise(resolve => { lost = resolve; }),
  };
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => ({ requestDevice: async () => device }) } });
});
afterEach(() => vi.unstubAllGlobals());

function line() {
  return { ...paint, kind: "path" as const, points: [[0, 0], [20, 20]] as [number, number][], closed: false,
    pivot: [0, 0] as [number, number], rotation: 0.7, stroke: { width: 0.3, cap: "butt" as const, join: "bevel" as const } };
}
it("batches 640 HDR lines and a trail fade without per-line uploads or passes", async () => {
  const renderer = await WebGpu2DRenderer.create(canvas);
  const f = decodeHdrFrame({ ...frame(), width: 1920, height: 1080, commands: [
    { ...paint, color: [0, 0, 0, 0.003], intensity: 1, kind: "path", points: [[0, 0], [1920, 0], [1920, 1080], [0, 1080]], closed: true, pivot: [960, 540], rotation: 0, stroke: null },
    ...Array.from({ length: 640 }, line),
  ], effects: [10, 5, 2, 3].map(kind => ({ kind, amount: 0.7, params: [4, 2, 0, 0, 0, 0, 0, 0], color: [0, 0, 0, 1], asset: null })) });
  renderer.render(f);
  const buffers = device.createBuffer.mock.calls.length;
  passes = []; records = []; device.queue.submit.mockClear();
  renderer.render({ ...f, sequence: 2 });
  expect(passes).toHaveLength(6); // geometry + four effects + presentation
  expect(passes[0]).toEqual({ load: "load", draws: [[6, 641]] });
  expect(device.queue.submit).toHaveBeenCalledTimes(6);
  expect(device.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  expect(device.createBuffer.mock.calls.length).toBe(buffers);
  expect(records[0]).toHaveLength(641 * 14);
  renderer.dispose();
});
it("flushes geometry around raster fallback and clear without changing draw order", async () => {
  const renderer = await WebGpu2DRenderer.create(canvas);
  renderer.render(frame()); passes = []; device.queue.copyExternalImageToTexture.mockClear();
  renderer.render(decodeHdrFrame({ ...frame(2), commands: [line(), frame().commands[0], line(), { kind: "clear" }, line()] }));
  expect(passes.map(p => p.draws)).toEqual([[[6, 1]], [[3]], [[6, 1]], [], [[6, 1]], [[3]]]);
  expect(passes.map(p => p.load)).toEqual(["load", "clear", "load", "clear", "load", "clear"]);
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  renderer.dispose();
});

it("composites rotated paints in float targets and applies a frame only once", async () => {
  const renderer = await WebGpu2DRenderer.create(canvas);
  expect(renderer.render(frame(0))).toBe(false);
  expect(renderer.render(frame())).toBe(true);
  expect(ctx.rotate).toHaveBeenCalledWith(0.7);
  expect(records.filter(r => r[0] === 1)[0]?.slice(18)).toEqual([0, 4]);
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  renderer.render(frame());
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  renderer.render({ ...frame(2), commands: [] });
  expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledOnce();
  expect(textures.filter(t => t.format === "rgba8unorm")).toHaveLength(1);
  renderer.dispose();
  expect(device.destroy).toHaveBeenCalledOnce();
});
it("keeps scene/history isolated from a complete effect chain, bloom and large blur", async () => {
  const renderer = await WebGpu2DRenderer.create(canvas);
  const f = frame(); f.clearScene = true; f.scramble = { kind: 1, refresh: [0, 0, 0, 0.1] };
  f.effects = Array.from({ length: 25 }, (_, i) => ({ kind: i + 1, amount: 2, params: [3, 40, 4, 1, 0, 0, 0, 0], color: [0, 0, 0, 1], asset: null }));
  renderer.render(f); renderer.render({ ...f, sequence: 2 });
  const count = device.createTexture.mock.calls.length;
  renderer.render({ ...f, sequence: 3 });
  // Only the browser-owned presentation texture is new on the next frame.
  expect(device.createTexture.mock.calls.length).toBe(count);
  expect(records.some(r => r[0] === 27)).toBe(true);
  expect(records.some(r => r[0] === 28)).toBe(true);
  renderer.dispose();
});
it("resets dimensions and releases old buffers, then disposes idempotently", async () => {
  const renderer = await WebGpu2DRenderer.create(canvas);
  renderer.render(frame());
  const old = textures.slice(0, -1);
  renderer.render({ ...frame(2), width: 32, height: 16 });
  expect(old.every(t => t.destroyed)).toBe(true);
  expect([canvas.width, canvas.height]).toEqual([32, 16]);
  renderer.dispose(); renderer.dispose();
  expect(device.destroy).toHaveBeenCalledOnce();
});
it("reports device loss and validation failure so the owner can fall back", async () => {
  const onError = vi.fn();
  const renderer = await WebGpu2DRenderer.create(canvas, { onError });
  lost({ reason: "unknown", message: "test loss" });
  await Promise.resolve();
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "HDR device lost: test loss" }));
  expect(() => renderer.render(frame())).toThrow("device lost");
  onGpuError({ error: new Error("secondary") });
  expect(onError).toHaveBeenCalledOnce(); renderer.dispose();
});
it("does not configure an aborted activation", async () => {
  const controller = new AbortController();
  device.createRenderPipelineAsync.mockImplementation(async () => { controller.abort(); return {}; });
  await expect(WebGpu2DRenderer.create(canvas, { signal: controller.signal })).rejects.toThrow();
  expect(canvas.getContext).not.toHaveBeenCalled();
  expect(device.destroy).toHaveBeenCalledOnce();
});
it("rejects malformed command frames instead of silently omitting draws", () => {
  for (const bad of [
    { ...frame(), version: 1 }, { ...frame(), width: NaN },
    { ...frame(), commands: [{ kind: "unknown" }] },
    { ...frame(), commands: [{ ...frame().commands[0], intensity: 7 }] },
    { ...frame(), commands: [{ ...frame().commands[0], rotation: Infinity }] },
  ]) expect(() => decodeHdrFrame(bad)).toThrow("Invalid HDR");
});
it("resolves narrow scramble's in-place byte dependencies without reading GPU pixels", () => {
  const map = scrambleAddressMap(1, 8, 2);
  // Original loop's channel 2 reads an earlier byte already rewritten in this pass.
  expect(map[0]).toBe(4);
  expect(map[2]).toBe(-1);
  expect(map[6]).toBe(-1);
  expect(() => scrambleAddressMap(27, 8, 2)).toThrow();
});

it("replays stroked gradients, text, images and every blend mode without losing intensity", async () => {
  vi.stubGlobal("ImageData", class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  const renderer = await WebGpu2DRenderer.create(canvas, { assets: [{ id: "texture", kind: "texture", width: 1, height: 1, rgba: new Uint8Array([255, 128, 0, 128]) }] });
  const f = decodeHdrFrame({ ...frame(), commands: [
    { kind: "clear" },
    { ...paint, kind: "background", blend: "none" },
    { ...frame().commands[0], blend: "multiply", stroke: { width: 7, cap: "round", join: "bevel" },
      gradient: { axis: [0, 0, 20, 20], radius: null, stops: [[0, [1, 0, 0, 1]], [1, [0, 0, 1, 0.5]]] } },
    { ...paint, kind: "text", text: "HDR", font: "20px monospace", position: [5, 20],
      gradient: { axis: [10, 10, 0, 0], radius: 10, stops: [[0, [1, 1, 1, 1]], [1, [0, 0, 0, 1]]] } },
    { ...paint, kind: "image", blend: "additive", rect: [10, 20, 30, 40], opacity: 0.4, asset: "texture" },
  ] });
  renderer.render(f);
  expect(ctx.stroke).toHaveBeenCalledOnce();
  expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 0, 20, 20);
  expect(ctx.createRadialGradient).toHaveBeenCalledWith(10, 10, 0, 10, 10, 10);
  expect(ctx.fillText).toHaveBeenCalledWith("HDR", 5, 20);
  expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 10, 20, 30, 40);
  expect(records.filter(r => r[0] === 1).map(r => r.slice(18))).toEqual([[3, 4], [2, 4], [0, 4], [1, 4]]);
  renderer.dispose();
});
