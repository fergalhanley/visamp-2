import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  set_animation_paused: vi.fn(),
  validate_script: vi.fn(() => ""),
  load_script: vi.fn(() => ""),
  clear_assets: vi.fn(),
  get_last_error: vi.fn(() => ""),
  get_hdr_2d_snapshot: vi.fn(() => JSON.stringify({
    version: 2, sequence: 1, width: 640, height: 360, clearScene: false, seconds: 1 / 60,
    effects: [], scramble: null,
    commands: [{ kind: "background", transform: [1, 0, 0, 1, 0, 0], color: [1, 1, 1, 1],
      gradient: null, blend: "alpha", intensity: 4 }],
  })),
}));
const gpu = vi.hoisted(() => ({
  create: vi.fn(), render: vi.fn(), dispose: vi.fn(),
}));
vi.mock("@visamp/engine", () => engine);
vi.mock("../../../../packages/player/src/webgpu-2d-renderer", () => ({
  WebGpu2DRenderer: { create: gpu.create },
}));
import { VisampCanvas } from "@visamp/player";

const source = `prop angle = 0.0
on_frame { angle = $TIME_SEC }
render {
  draw::background(color: $COLOR_BLACK)
  draw::circle(x: $WIDTH / 2.0, y: $HEIGHT / 2.0, radius: 80.0, color: $COLOR_TURQUOISE, intensity: 4.1)
  draw::rect(x: $WIDTH / 2.0 - 40.0, y: $HEIGHT / 2.0 - 40.0, width: 80.0, height: 80.0, color: $COLOR_CRIMSON, intensity: 3.0)
}`;
let frames: Map<number, FrameRequestCallback>;
beforeEach(() => {
  vi.clearAllMocks();
  frames = new Map();
  let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    frames.set(++id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  vi.stubGlobal("navigator", { gpu: {} });
  vi.stubGlobal("matchMedia", () => ({ addEventListener() {}, removeEventListener() {} }));
  gpu.render.mockReturnValue(true);
  gpu.create.mockResolvedValue({ render: gpu.render, dispose: gpu.dispose });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("renders HDR for the default 2D context only after a frame is drawn", async () => {
  const view = render(<VisampCanvas source={source} active autoHdr2D />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  const canvas = view.getByLabelText("Experimental HDR WebGPU preview");
  expect(canvas.parentElement?.style.opacity).toBe("0");
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  expect(gpu.render).toHaveBeenCalledOnce();
  expect(canvas.parentElement?.style.opacity).toBe("1");
  expect(view.container.querySelector("#visamp-stage")).not.toBeNull();
});

it("keeps the SDR stage visible when WebGPU setup fails", async () => {
  gpu.create.mockRejectedValueOnce(new Error("No WebGPU adapter available"));
  const view = render(<VisampCanvas source={source} active autoHdr2D />);
  await waitFor(() => expect(view.container.textContent).toContain("HDR setup failed"));
  expect(engine.load_script).toHaveBeenCalledWith(source);
  const stage = view.container.querySelector<HTMLElement>("#visamp-stage");
  expect(stage?.style.width).toBe("100%");
  expect(stage?.style.height).toBe("100%");
  expect(view.getByLabelText("Experimental HDR WebGPU preview").parentElement?.style.opacity).toBe("0");
});

it("keeps HDR diagnostics and canvas buffers out of the viewport's layout flow", async () => {
  const view = render(<VisampCanvas source={source} active autoHdr2D />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  const stage = view.container.querySelector<HTMLElement>("#visamp-stage");
  const viewport = stage?.parentElement?.parentElement;
  const status = view.getByText(/^HDR:/);
  const canvas = view.getByLabelText("Experimental HDR WebGPU preview");
  expect(viewport?.contains(status)).toBe(true);
  expect(getComputedStyle(status).position).toBe("absolute");
  expect(getComputedStyle(canvas).position).toBe("absolute");
  expect(stage?.style.position).toBe("absolute");
});

it("selects 2D without an intensity literal and retains the renderer while paused", async () => {
  const view = render(<VisampCanvas source="render { draw::circle() }" active />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  const stage = view.container.querySelector<HTMLElement>("#visamp-stage");
  expect(stage?.style.opacity).toBe("0");
  view.rerender(<VisampCanvas source="render { draw::circle() }" active={false} />);
  expect(gpu.dispose).not.toHaveBeenCalled();
  view.rerender(<VisampCanvas source="render { draw::circle() }" active />);
  expect(gpu.create).toHaveBeenCalledOnce();
  view.unmount();
  expect(gpu.dispose).toHaveBeenCalledOnce();
});

it("restores the SDR stage after an asynchronous GPU failure", async () => {
  const view = render(<VisampCanvas source={source} active />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  act(() => gpu.create.mock.calls[0]?.[1].onError(new Error("device lost")));
  expect(view.container.querySelector<HTMLElement>("#visamp-stage")?.style.opacity).toBe("1");
  expect(view.getByLabelText("Experimental HDR WebGPU preview").parentElement?.style.opacity).toBe("0");
  expect(frames.size).toBe(0);
});

it("restores the stage when switching from 2D HDR to a 3D script", async () => {
  const view = render(<VisampCanvas source={source} active />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  expect(view.container.querySelector<HTMLElement>("#visamp-stage")?.style.opacity).toBe("0");
  view.rerender(<VisampCanvas source="context 3d render { draw::cube() }" active />);
  await waitFor(() => expect(view.queryByLabelText("Experimental HDR WebGPU preview")).toBeNull());
  expect(view.container.querySelector<HTMLElement>("#visamp-stage")?.style.opacity).toBe("1");
});
