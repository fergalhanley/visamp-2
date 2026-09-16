// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  startInputBridge,
  scrollPixels,
} from "../../../../packages/player/src/input-bridge";
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  document.body.innerHTML = "";
});
function fixture(capabilities = 7) {
  const host = document.createElement("div");
  document.body.append(host);
  Object.defineProperties(host, {
    clientWidth: { value: 400 },
    clientHeight: { value: 200 },
  });
  host.getBoundingClientRect = () =>
    ({ left: 20, top: 30, width: 800, height: 400 }) as DOMRect;
  const capture = new Set<number>();
  host.setPointerCapture = vi.fn((id) => {
    capture.add(id);
  });
  host.hasPointerCapture = (id) => capture.has(id);
  host.releasePointerCapture = vi.fn((id) => {
    capture.delete(id);
  });
  const packets: Record<string, unknown>[] = [];
  const engine = {
    queue_input: vi.fn((json) => packets.push(JSON.parse(json))),
    clear_input: vi.fn(),
  };
  const error = vi.fn();
  const cleanup = startInputBridge(host, engine, capabilities, error);
  cleanups.push(cleanup);
  const pointer = (type: string, extra = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, {
      isPrimary: true,
      pointerId: 1,
      clientX: 60,
      clientY: 70,
      buttons: 0,
      shiftKey: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
      ...extra,
    });
    host.dispatchEvent(event);
    return event;
  };
  const key = (type: string, key: string, code: string, extra = {}) => {
    const event = new KeyboardEvent(type, {
      key,
      code,
      bubbles: true,
      cancelable: true,
      ...extra,
    });
    host.dispatchEvent(event);
    return event;
  };
  return { host, engine, packets, pointer, key, cleanup, error };
}
it("captures a drag, scales coordinates, preserves outside release, and cancels click", () => {
  const f = fixture();
  f.pointer("pointerdown", { buttons: 1 });
  expect(document.activeElement).toBe(f.host);
  expect(f.host.setPointerCapture).toHaveBeenCalledWith(1);
  expect(f.packets[0]).toMatchObject({
    kind: "pointer_down",
    button: "primary",
    x: 20,
    y: 20,
    buttons: 1,
  });
  f.pointer("pointermove", { buttons: 1, clientX: -20 });
  f.pointer("pointerup", { clientX: -20 });
  expect(f.packets.at(-1)).toMatchObject({
    kind: "pointer_up",
    x: -20,
    inside: false,
    buttons: 0,
  });
  expect(f.packets.some((p) => p.kind === "pointer_click")).toBe(false);
  expect(f.host.releasePointerCapture).toHaveBeenCalledWith(1);
});
it("delivers button chords and a completed click, ignores another pointer", () => {
  const f = fixture();
  f.pointer("pointerdown", { buttons: 1 });
  f.pointer("pointermove", { buttons: 3 });
  f.pointer("pointermove", { buttons: 1 });
  f.pointer("pointerup", { pointerId: 2 });
  f.pointer("pointerup");
  expect(
    f.packets
      .filter((p) => p.kind !== "pointer_move")
      .map((p) => [p.kind, p.button, p.buttons]),
  ).toEqual([
    ["pointer_down", "primary", 1],
    ["pointer_down", "secondary", 3],
    ["pointer_up", "secondary", 1],
    ["pointer_up", "primary", 0],
    ["pointer_click", "primary", 0],
  ]);
});
it("keyboard focus, repeat, shortcuts and Escape follow host policy", () => {
  const f = fixture(2);
  f.key("keydown", "w", "KeyW");
  expect(f.packets).toHaveLength(0);
  f.host.focus();
  f.key("keydown", "w", "KeyW");
  f.key("keydown", "w", "KeyW", { repeat: true });
  f.key("keydown", "s", "KeyS", { ctrlKey: true });
  f.key("keyup", "w", "KeyW", { ctrlKey: true });
  expect(f.packets.map((p) => p.kind)).toEqual([
    "key_down",
    "key_down",
    "key_up",
  ]);
  expect(f.packets[1]?.repeat).toBe(true);
  expect(f.key("keydown", "ArrowUp", "ArrowUp").defaultPrevented).toBe(true);
  expect(f.key("keydown", "Tab", "Tab").defaultPrevented).toBe(false);
  f.key("keydown", "Escape", "Escape");
  expect(document.activeElement).not.toBe(f.host);
  expect(f.engine.clear_input).toHaveBeenCalled();
});
it("only focused scroll consumers prevent wheel defaults, never browser zoom", () => {
  const f = fixture(4);
  const wheel = (extra = {}) => {
    const e = new WheelEvent("wheel", {
      deltaY: 2,
      deltaMode: 1,
      cancelable: true,
      ...extra,
    });
    f.host.dispatchEvent(e);
    return e;
  };
  expect(wheel().defaultPrevented).toBe(false);
  f.host.focus();
  expect(wheel().defaultPrevented).toBe(true);
  expect(f.packets[0]).toMatchObject({ kind: "scroll", delta_y: 32 });
  expect(wheel({ ctrlKey: true }).defaultPrevented).toBe(false);
  expect(
    scrollPixels({ deltaMode: 2, deltaX: 1, deltaY: -1 }, 400, 200),
  ).toEqual({ delta_x: 400, delta_y: -200 });
});
it("blur, capture loss and cleanup release inputs and remove listeners", () => {
  const f = fixture();
  f.pointer("pointerdown", { buttons: 1 });
  f.host.dispatchEvent(new Event("lostpointercapture"));
  expect(f.engine.clear_input).toHaveBeenCalledTimes(1);
  f.pointer("pointerdown", { buttons: 1 });
  window.dispatchEvent(new Event("blur"));
  expect(f.engine.clear_input).toHaveBeenCalledTimes(2);
  f.cleanup();
  const n = f.packets.length;
  f.pointer("pointerdown", { buttons: 1 });
  f.key("keydown", "x", "KeyX");
  expect(f.packets).toHaveLength(n);
  expect(f.host.hasAttribute("tabindex")).toBe(false);
});
it("noninteractive sources do not change the host or attach handlers", () => {
  const f = fixture(0);
  f.pointer("pointerdown", { buttons: 1 });
  expect(f.packets).toHaveLength(0);
  expect(f.host.hasAttribute("tabindex")).toBe(false);
});
it("transport errors cancel held input and are visible", () => {
  const f = fixture();
  f.engine.queue_input.mockImplementation(() => {
    throw new Error("overflow");
  });
  f.pointer("pointerdown", { buttons: 1 });
  expect(f.error).toHaveBeenCalledWith("Error: overflow");
  expect(f.engine.clear_input).toHaveBeenCalled();
});
