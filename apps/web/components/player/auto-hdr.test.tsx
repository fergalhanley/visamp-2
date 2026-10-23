import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  set_animation_paused: vi.fn(),
  validate_script: vi.fn(() => ""),
  load_script: vi.fn(() => ""),
  clear_assets: vi.fn(),
  get_last_error: vi.fn(() => ""),
  get_hdr_2d_snapshot: vi.fn(() => JSON.stringify({
    width: 640, height: 360, clear: [0, 0, 0, 1],
    shapes: [
      { kind: "circle", x: 320, y: 180, radius: 80, color: [0.251, 0.878, 0.816, 1], intensity: 4.1 },
      { kind: "rect", x: 280, y: 140, width: 80, height: 80, color: [0.863, 0.078, 0.235, 1], intensity: 3 },
    ],
  })),
}));
const gpu = vi.hoisted(() => ({
  create: vi.fn(), render: vi.fn(), dispose: vi.fn(),
}));
vi.mock("@visamp/engine", () => engine);
vi.mock("../../../../packages/player/src/webgpu-hdr-renderer", () => ({
  HdrSceneRenderer: { create: gpu.create },
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
