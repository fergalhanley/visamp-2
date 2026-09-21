import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useOutputPointer } from "./use-output-pointer";
function Surface() {
  const { surface, hidden } = useOutputPointer();
  return <div ref={surface} data-testid="output" style={{ cursor: hidden ? "none" : "default" }}><button>Enable audio</button></div>;
}
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null }); });
it("shows on movement, hides after three still seconds or a surface click", () => {
  vi.useFakeTimers();
  render(<Surface />);
  const el = screen.getByTestId("output");
  expect(el.style.cursor).toBe("default");
  act(() => vi.advanceTimersByTime(2999));
  expect(el.style.cursor).toBe("default");
  act(() => vi.advanceTimersByTime(1));
  expect(el.style.cursor).toBe("none");
  fireEvent(el, new MouseEvent("pointermove", { clientX: 10, clientY: 10 }));
  expect(el.style.cursor).toBe("default");
  fireEvent.click(el);
  expect(el.style.cursor).toBe("none");
  fireEvent(el, new MouseEvent("pointermove", { clientX: 20, clientY: 10 }));
  fireEvent.click(screen.getByText("Enable audio"));
  expect(el.style.cursor).toBe("default");
});
it("double-click toggles pop-out fullscreen and movement cannot reveal the cursor there", () => {
  render(<Surface />);
  const el = screen.getByTestId("output");
  const enter = vi.fn().mockResolvedValue(undefined), exit = vi.fn().mockResolvedValue(undefined);
  el.requestFullscreen = enter;
  document.exitFullscreen = exit;
  fireEvent.doubleClick(el);
  expect(enter).toHaveBeenCalledOnce();
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: el });
  fireEvent(document, new Event("fullscreenchange"));
  fireEvent(el, new MouseEvent("pointermove", { clientX: 30 }));
  expect(el.style.cursor).toBe("none");
  fireEvent.doubleClick(el);
  expect(exit).toHaveBeenCalledOnce();
  Object.defineProperty(document, "fullscreenElement", { configurable: true, value: null });
  fireEvent(document, new Event("fullscreenchange"));
  expect(el.style.cursor).toBe("default");
});
