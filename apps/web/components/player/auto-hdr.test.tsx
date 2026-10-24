import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  set_animation_paused: vi.fn(),
  validate_script: vi.fn(() => ""),
  load_script: vi.fn(() => ""),
  clear_assets: vi.fn(),
  get_last_error: vi.fn(() => ""),
  get_hdr_2d_requested: vi.fn(() => true),
  set_hdr_2d_recording: vi.fn(),
  set_hdr_2d_presenting: vi.fn(),
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

const macChrome155 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/155.0.0.0 Safari/537.36";
const compositorSelector = "[data-visamp-hdr-compositor]";

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
  engine.get_hdr_2d_requested.mockReturnValue(true);
  frames = new Map();
  let id = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(callback => {
    frames.set(++id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(id => { frames.delete(id); });
  vi.stubGlobal("navigator", { gpu: {}, userAgent: macChrome155 });
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
  expect(engine.set_hdr_2d_recording).toHaveBeenCalledWith(true);
  expect(engine.set_hdr_2d_presenting).toHaveBeenLastCalledWith(true);
  expect(canvas.parentElement?.style.opacity).toBe("1");
  expect(view.container.querySelector("#visamp-stage")).not.toBeNull();
});

it("leaves ordinary SDR scripts on the native path until explicit HDR is loaded", async () => {
  engine.get_hdr_2d_requested.mockReturnValue(false);
  const view = render(<VisampCanvas source="render { draw::line() }" active />);
  await waitFor(() => expect(engine.load_script).toHaveBeenCalled());
  expect(gpu.create).not.toHaveBeenCalled();
  expect(engine.get_hdr_2d_snapshot).not.toHaveBeenCalled();
  expect(engine.set_hdr_2d_recording).not.toHaveBeenCalledWith(true);
  expect(view.queryByLabelText("Experimental HDR WebGPU preview")).toBeNull();
  expect(view.container.querySelector(compositorSelector)).toBeNull();
  engine.get_hdr_2d_requested.mockReturnValue(true);
  view.rerender(<VisampCanvas source={source} active />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  expect(engine.set_hdr_2d_recording).toHaveBeenCalledWith(true);
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
  expect(view.container.querySelector(compositorSelector)?.parentElement?.style.opacity).toBe("0");
});

it("records explicit comparison previews without suppressing the SDR renderer", async () => {
  engine.get_hdr_2d_requested.mockReturnValue(false);
  render(<VisampCanvas source="render { draw::line() }" active hdrPreview hdr2dPreview />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  expect(engine.set_hdr_2d_recording).toHaveBeenCalledWith(true);
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  expect(gpu.render).toHaveBeenCalledOnce();
  expect(engine.set_hdr_2d_presenting).not.toHaveBeenCalledWith(true);
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

it("uses parsed dynamic HDR intent and retains the renderer while paused", async () => {
  const dynamic = "prop gain = 3 render { draw::circle(intensity: gain) }";
  const view = render(<VisampCanvas source={dynamic} active />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  const stage = view.container.querySelector<HTMLElement>("#visamp-stage");
  expect(stage?.style.opacity).toBe("0");
  view.rerender(<VisampCanvas source={dynamic} active={false} />);
  expect(gpu.dispose).not.toHaveBeenCalled();
  view.rerender(<VisampCanvas source={dynamic} active />);
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
  expect(engine.set_hdr_2d_recording).toHaveBeenLastCalledWith(false);
  expect(engine.set_hdr_2d_presenting).toHaveBeenLastCalledWith(false);
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
  engine.get_hdr_2d_requested.mockReturnValue(false);
  view.rerender(<VisampCanvas source="context 3d render { draw::cube() }" active />);
  await waitFor(() => expect(view.queryByLabelText("Experimental HDR WebGPU preview")).toBeNull());
  expect(view.container.querySelector<HTMLElement>("#visamp-stage")?.style.opacity).toBe("1");
  expect(view.container.querySelector(compositorSelector)).toBeNull();
});

it("keeps the HDR compositor layer when player controls disappear and playback pauses", async () => {
  const player = (visible: boolean, active = true) => <>
    <div data-testid="controls" style={{ visibility: visible ? "visible" : "hidden", backdropFilter: "blur(20px)" }}>Controls</div>
    <VisampCanvas source={source} active={active} />
  </>;
  const view = render(player(true));
  await waitFor(() => expect(frames.size).toBe(1));
  act(() => {
    const callbacks = [...frames.values()]; frames.clear();
    callbacks.forEach(callback => callback(16));
  });
  const layer = view.container.querySelector<HTMLElement>(compositorSelector);
  expect(layer).not.toBeNull();
  expect(layer?.style.backdropFilter).toBe("blur(0px)");
  expect(layer?.style.pointerEvents).toBe("none");
  expect(layer?.style.position).toBe("absolute");
  expect(layer?.getAttribute("aria-hidden")).toBe("true");
  expect(layer?.parentElement?.style.opacity).toBe("1");
  expect(layer?.parentElement?.querySelector("canvas")).not.toBeNull();
  view.rerender(player(false));
  expect(view.getByTestId("controls").style.visibility).toBe("hidden");
  expect(view.container.querySelector(compositorSelector)).toBe(layer);
  expect(layer?.parentElement?.style.opacity).toBe("1");
  view.rerender(player(false, false));
  expect(view.container.querySelector(compositorSelector)).toBe(layer);
  expect(layer?.parentElement?.style.opacity).toBe("1");
  view.rerender(player(true));
  expect(view.container.querySelector(compositorSelector)).toBe(layer);
  expect(gpu.create).toHaveBeenCalledOnce();
  expect(gpu.dispose).not.toHaveBeenCalled();
});

it.each([
  { name: "affected Mac Chromium", userAgent: macChrome155, override: undefined, expected: true },
  { name: "fixed Mac Chromium", userAgent: macChrome155.replace("155.", "157."), override: undefined, expected: false },
  { name: "Safari", userAgent: "Mozilla/5.0 (Macintosh) Version/26.0 Safari/605.1.15", override: undefined, expected: false },
  { name: "explicit opt-out", userAgent: macChrome155, override: false, expected: false },
  { name: "explicit diagnostic opt-in", userAgent: "", override: true, expected: true },
])("scopes the compositor workaround: $name", async ({ userAgent, override, expected }) => {
  vi.stubGlobal("navigator", { gpu: {}, userAgent });
  const view = render(<VisampCanvas source={source} active hdrCompositingWorkaround={override} />);
  await waitFor(() => expect(gpu.create).toHaveBeenCalledOnce());
  expect(Boolean(view.container.querySelector(compositorSelector))).toBe(expected);
});
