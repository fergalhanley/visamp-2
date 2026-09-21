import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
import { InputController } from "./input-controller";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("captures only when armed, forwards key names/codes and chorded buttons, and releases on Escape", async () => {
  const send = vi.fn();
  let locked: Element | null = null;
  Object.defineProperty(document, "pointerLockElement", {
    configurable: true,
    get: () => locked,
  });
  document.exitPointerLock = () => {
    locked = null;
    document.dispatchEvent(new Event("pointerlockchange"));
  };
  const { getByRole } = render(
    <InputController send={send} destination="Embedded" />,
  );
  const pad = getByRole("button", { name: "Input Controller" });
  Object.defineProperty(pad, "clientWidth", { value: 200 });
  Object.defineProperty(pad, "clientHeight", { value: 100 });
  pad.requestPointerLock = async () => {
    locked = pad;
    document.dispatchEvent(new Event("pointerlockchange"));
  };
  fireEvent.keyDown(window, { key: "a", code: "KeyA" });
  expect(send).not.toHaveBeenCalled();
  fireEvent.click(pad);
  await waitFor(() => expect(pad.getAttribute("data-armed")).toBe("true"));
  fireEvent.keyDown(window, { key: "a", code: "KeyA" });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "key",
      key: "a",
      code: "KeyA",
      action: "down",
    }),
  );
  const pointer = (buttons: number) => {
    const e = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.assign(e, { buttons, button: -1, movementX: 10, movementY: 0 });
    fireEvent(pad, e);
  };
  pointer(1);
  pointer(3);
  pointer(0);
  const downs = send.mock.calls
    .map(([e]) => e)
    .filter((e) => e?.type === "pointer" && e.action === "down");
  expect(downs.map((e) => e.button)).toEqual([0, 2]);
  expect(downs[0].x).toBe(0.55);
  fireEvent.wheel(pad, { deltaY: 2, deltaMode: 1 });
  expect(send).toHaveBeenCalledWith(
    expect.objectContaining({ type: "wheel", dy: 32 }),
  );
  const count = send.mock.calls.length;
  fireEvent.keyDown(window, { key: "l", code: "KeyL", ctrlKey: true });
  expect(send.mock.calls).toHaveLength(count);
  fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
  expect(locked).toBeNull();
  expect(send).toHaveBeenLastCalledWith(null);
  const released = send.mock.calls.length;
  fireEvent.keyDown(window, { key: "b", code: "KeyB" });
  expect(send.mock.calls).toHaveLength(released);
});
