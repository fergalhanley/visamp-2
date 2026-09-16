import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const engine = vi.hoisted(() => ({
  validate_script: vi.fn(() => ""),
  load_script: vi.fn(() => ""),
  clear_assets: vi.fn(),
  get_last_error: vi.fn(() => ""),
  get_canvas_filter: vi.fn(() => ""),
  input_capabilities: vi.fn(() => 2),
  queue_input: vi.fn(),
  clear_input: vi.fn(),
}));
vi.mock("@visamp/engine", () => engine);
import { VisampCanvas } from "@visamp/player";
afterEach(cleanup);
it("attaches only after activation and host opt-in, suspends for assets, and detaches on inactivity", async () => {
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const view = render(<VisampCanvas source="first" active />);
  await waitFor(() => expect(engine.load_script).toHaveBeenCalledWith("first"));
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
  expect(host.hasAttribute("tabindex")).toBe(false);
});
