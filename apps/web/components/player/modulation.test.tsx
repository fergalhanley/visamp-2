import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const engine = vi.hoisted(() => ({
  set_animation_paused: vi.fn(), validate_script: vi.fn(() => ""), load_script: vi.fn(() => ""),
  clear_assets: vi.fn(), get_last_error: vi.fn(() => ""), get_hdr_2d_requested: vi.fn(() => false),
  set_modulation_config: vi.fn(),
}));
vi.mock("@visamp/engine", () => engine);
import { VisampCanvas } from "@visamp/player";
import { source, modulation } from "../../../../dev/lfo-phase1";
import { LfoDemo } from "../../app/dev/lfo/lfo-demo";
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("starts the demo on arrival and pauses without reloading its script", async () => {
  render(<LfoDemo />);
  await waitFor(() => expect(engine.set_modulation_config).toHaveBeenCalledWith(JSON.stringify(modulation)));
  expect(engine.load_script).toHaveBeenCalledWith(source);
  expect(screen.getByText("Script loaded — playing")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  expect(engine.set_animation_paused).toHaveBeenLastCalledWith(true);
  expect(screen.getByText("Script loaded — paused")).toBeDefined();
  expect(engine.load_script).toHaveBeenCalledOnce();
});

it("applies after load, updates without reloading, retains pause state and clears on removal/unmount", async () => {
  const view = render(<VisampCanvas source={source} modulation={modulation} active />);
  await waitFor(() => expect(engine.set_modulation_config).toHaveBeenCalledWith(JSON.stringify(modulation)));
  expect(engine.load_script.mock.invocationCallOrder[0]!).toBeLessThan(engine.set_modulation_config.mock.invocationCallOrder[0]!);
  expect(engine.set_modulation_config).toHaveBeenCalledOnce();
  view.rerender(<VisampCanvas source={source} modulation={modulation} active={false} />);
  expect(engine.set_modulation_config).toHaveBeenCalledOnce();
  const changed = { ...modulation, bpm: 90 };
  view.rerender(<VisampCanvas source={source} modulation={changed} active />);
  expect(engine.set_modulation_config).toHaveBeenLastCalledWith(JSON.stringify(changed));
  expect(engine.load_script).toHaveBeenCalledOnce();
  view.rerender(<VisampCanvas source={source} active />);
  expect(engine.set_modulation_config).toHaveBeenLastCalledWith("null");
  view.rerender(<VisampCanvas source={source} modulation={modulation} active />);
  view.unmount(); expect(engine.set_modulation_config).toHaveBeenLastCalledWith("null");
});
it("reapplies to each successful script activation and reports invalid replacements without stale routes", async () => {
  const log = vi.fn();
  const view = render(<VisampCanvas source={source} modulation={modulation} active onLog={log} />);
  await waitFor(() => expect(engine.set_modulation_config).toHaveBeenCalledOnce());
  view.rerender(<VisampCanvas source={source + "\n// reload"} modulation={modulation} active onLog={log} />);
  await waitFor(() => expect(engine.set_modulation_config).toHaveBeenCalledTimes(2));
  view.rerender(<VisampCanvas source={source + "\n// reload"} modulation={{ ...modulation, bpm: 0 }} active onLog={log} />);
  expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: "error", message: expect.stringContaining("Modulation:") }));
  expect(engine.set_modulation_config).toHaveBeenLastCalledWith("null");
});
it("installs simultaneous source/config replacements only after the new properties exist", async () => {
  const log = vi.fn();
  const view = render(<VisampCanvas source={source} modulation={modulation} active onLog={log} />);
  await waitFor(() => expect(engine.set_modulation_config).toHaveBeenCalledOnce());
  const next = { ...modulation, routes: [{ lfoId: "lfo-1", property: "other", min: -1, max: 1, enabled: true }] };
  view.rerender(<VisampCanvas source="prop other=0 render {}" modulation={next} active onLog={log} />);
  await waitFor(() => expect(engine.set_modulation_config).toHaveBeenCalledTimes(2));
  expect(engine.load_script.mock.invocationCallOrder.at(-1)!).toBeLessThan(engine.set_modulation_config.mock.invocationCallOrder.at(-1)!);
  expect(log).not.toHaveBeenCalled();
});
