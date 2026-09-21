import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const engine = vi.hoisted(() => ({
  set_animation_paused: vi.fn(),
  set_animation_time: vi.fn(),
  validate_script: vi.fn(() => ""),
  load_script: vi.fn(() => ""),
  clear_assets: vi.fn(),
  get_last_error: vi.fn(() => ""),
  input_capabilities: vi.fn(() => 2),
  queue_input: vi.fn(),
  clear_input: vi.fn(),
}));
vi.mock("@visamp/engine", () => engine);
import { createRef } from "react";
import { VisampCanvas, type VisampCanvasHandle } from "@visamp/player";
afterEach(cleanup);
it("attaches only after activation and host opt-in, suspends for assets, and detaches on inactivity", async () => {
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const ref = createRef<VisampCanvasHandle>();
  const view = render(<VisampCanvas ref={ref} source="first" active />);
  await waitFor(() => expect(engine.load_script).toHaveBeenCalledWith("first"));
  expect(engine.set_animation_paused).toHaveBeenLastCalledWith(false);
  ref.current!.setAnimationTime(1250);
  expect(engine.set_animation_time).toHaveBeenLastCalledWith(1250);
  ref.current!.setAnimationTime(null);
  expect(engine.set_animation_time).toHaveBeenLastCalledWith(undefined);
  const host = view.container.querySelector<HTMLElement>("#visamp-stage")!;
  expect(host.hasAttribute("tabindex")).toBe(false);
  view.rerender(<VisampCanvas source="first" active interactive />);
  await waitFor(() => expect(host.tabIndex).toBe(0));
  host.focus();
  fireEvent.keyDown(host, { key: "a", code: "KeyA" });
  expect(engine.queue_input).toHaveBeenCalledTimes(1);
  const preparation = {
    status: "loading" as const,
    missing: [],
    retry: () => {},
    scope: "default",
  };
  view.rerender(
    <VisampCanvas
      source="second"
      active
      interactive
      assetPreparation={preparation}
    />,
  );
  expect(host.hasAttribute("tabindex")).toBe(false);
  expect(engine.clear_input).toHaveBeenCalled();
  fireEvent.keyDown(host, { key: "b", code: "KeyB" });
  expect(engine.queue_input).toHaveBeenCalledTimes(1);
  view.rerender(
    <VisampCanvas
      source="second"
      active
      interactive
      assetPreparation={{ ...preparation, status: "ready" }}
    />,
  );
  await waitFor(() =>
    expect(engine.load_script).toHaveBeenCalledWith("second"),
  );
  await waitFor(() => expect(host.tabIndex).toBe(0));
  view.rerender(<VisampCanvas source="second" active={false} interactive />);
  expect(engine.set_animation_paused).toHaveBeenLastCalledWith(true);
  expect(host.hasAttribute("tabindex")).toBe(false);
});
