import type { EngineModule } from "./types";

type InputEngine = Pick<EngineModule, "queue_input" | "clear_input">;
const BUTTONS = [
  [1, "primary"],
  [2, "secondary"],
  [4, "auxiliary"],
  [8, "back"],
  [16, "forward"],
] as const;
const modifiers = (e: MouseEvent | KeyboardEvent) => ({
  shift: e.shiftKey,
  control: e.ctrlKey,
  alt: e.altKey,
  meta: e.metaKey,
});

/** Convert wheel units to CSS pixels: lines=16px, pages=host dimensions. */
export function scrollPixels(
  e: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">,
  width: number,
  height: number,
) {
  const xScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? width : 1;
  const yScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
  return { delta_x: e.deltaX * xScale, delta_y: e.deltaY * yScale };
}

/** Attach only to an opted-in, compiled visual. Cleanup owns every listener. */
export function startInputBridge(
  host: HTMLElement,
  engine: InputEngine,
  capabilities: number,
  onError: (message: string) => void,
) {
  if (!capabilities) return () => {};
  const pointer = Boolean(capabilities & 1);
  const keyboard = Boolean(capabilities & 2);
  const scroll = Boolean(capabilities & 4);
  const win = host.ownerDocument.defaultView!;
  const doc = host.ownerDocument;
  const abort = new AbortController();
  let pointerId: number | null = null;
  let buttons = 0;
  let clickStart: { x: number; y: number } | null = null;
  const heldCodes = new Set<string>();
  const oldTabIndex = host.getAttribute("tabindex");
  const oldTouchAction = host.style.touchAction;
  const oldLabel = host.getAttribute("aria-label");
  host.tabIndex = 0;
  host.setAttribute(
    "aria-label",
    "Interactive visualisation. Click or focus to control. Escape releases focus.",
  );
  if (pointer) host.style.touchAction = "none";
  const focused = () => doc.activeElement === host;
  const releaseCapture = () => {
    const id = pointerId;
    pointerId = null;
    if (id !== null && host.hasPointerCapture(id))
      host.releasePointerCapture(id);
  };
  const reset = () => {
    buttons = 0;
    clickStart = null;
    heldCodes.clear();
    releaseCapture();
    engine.clear_input();
  };
  const send = (packet: object) => {
    try {
      engine.queue_input(JSON.stringify(packet));
      return true;
    } catch (error) {
      reset();
      onError(String(error));
      return false;
    }
  };
  const position = (e: MouseEvent) => {
    const r = host.getBoundingClientRect();
    // Engine dimensions are layout CSS pixels, independent of DPR/CSS scaling.
    const x = ((e.clientX - r.left) * host.clientWidth) / (r.width || 1);
    const y = ((e.clientY - r.top) * host.clientHeight) / (r.height || 1);
    return {
      x,
      y,
      inside: x >= 0 && y >= 0 && x < host.clientWidth && y < host.clientHeight,
    };
  };
  const emitPointer = (kind: string, e: PointerEvent, button = "") => {
    return send({ kind, ...position(e), buttons, button, ...modifiers(e) });
  };
  const transitions = (e: PointerEvent) => {
    // Pointer Events emits pointerdown/up only for first/last mouse buttons;
    // diff the bitmask on every event to retain chorded button transitions.
    const next = e.buttons & 31;
    for (const [mask, button] of BUTTONS) {
      if ((buttons & mask) === (next & mask)) continue;
      const down = Boolean(next & mask);
      buttons = down ? buttons | mask : buttons & ~mask;
      if (!emitPointer(down ? "pointer_down" : "pointer_up", e, button))
        return false;
      if (mask === 1 && down) clickStart = { x: e.clientX, y: e.clientY };
      if (mask === 1 && !down) {
        if (
          clickStart &&
          position(e).inside &&
          Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) <= 5
        ) {
          if (!emitPointer("pointer_click", e, "primary")) return false;
        }
        clickStart = null;
      }
    }
    return true;
  };
  const onPointer = (event: Event) => {
    const e = event as PointerEvent;
    if (!e.isPrimary || (pointerId !== null && e.pointerId !== pointerId))
      return;
    if (e.type === "pointerdown") {
      host.focus({ preventScroll: true });
      e.stopPropagation();
      if (pointer) {
        pointerId = e.pointerId;
        host.setPointerCapture(e.pointerId);
      }
    }
    if (!pointer) return;
    if (e.type === "pointercancel") {
      reset();
      return;
    }
    // Outside drag coordinates continue; a drag never turns back into a click.
    if (
      clickStart &&
      Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) > 5
    )
      clickStart = null;
    if (
      e.type === "pointerdown" ||
      e.type === "pointerup" ||
      e.type === "pointermove"
    ) {
      // Hover with a button held elsewhere must not start an implicit drag.
      if (pointerId !== null && !transitions(e)) return;
      if (e.type === "pointermove") emitPointer("pointer_move", e);
      if (e.type === "pointerup" && e.buttons === 0) releaseCapture();
    } else if (e.type === "pointerenter" || e.type === "pointerleave") {
      emitPointer(
        e.type === "pointerenter" ? "pointer_enter" : "pointer_leave",
        e,
      );
    }
  };
  for (const type of [
    "pointerdown",
    "pointerup",
    "pointermove",
    "pointercancel",
    "pointerenter",
    "pointerleave",
  ]) {
    host.addEventListener(type, onPointer, { signal: abort.signal });
  }
  host.addEventListener(
    "lostpointercapture",
    () => {
      if (pointerId !== null) reset();
    },
    { signal: abort.signal },
  );
  // Do not let visual interaction also toggle player chrome/fullscreen.
  for (const type of ["click", "dblclick"])
    host.addEventListener(type, (e) => e.stopPropagation(), {
      signal: abort.signal,
    });
  host.addEventListener(
    "contextmenu",
    (e) => {
      if (pointer && focused()) e.preventDefault();
    },
    { signal: abort.signal },
  );
  const onKey = (event: Event) => {
    const e = event as KeyboardEvent;
    if (!focused() || e.target !== host) return;
    if (e.key === "Escape") {
      reset();
      host.blur();
      return;
    }
    if (!keyboard || e.isComposing) return;
    const up = e.type === "keyup";
    const modifierKey = ["Shift", "Control", "Alt", "Meta"].includes(e.key);
    // Browser/system shortcuts remain with the browser. Still release a key
    // previously delivered before a modifier was pressed.
    if (
      !(up && heldCodes.has(e.code)) &&
      (e.key === "Tab" ||
        (e.key.startsWith("F") && /^F\d+$/.test(e.key)) ||
        (!modifierKey && (e.ctrlKey || e.metaKey || e.altKey)))
    )
      return;
    if (!e.code || !e.key) return;
    if (up) heldCodes.delete(e.code);
    else heldCodes.add(e.code);
    send({
      kind: up ? "key_up" : "key_down",
      key: e.key,
      code: e.code,
      repeat: e.repeat,
      ...modifiers(e),
    });
    if (
      [
        " ",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Home",
        "End",
        "PageUp",
        "PageDown",
      ].includes(e.key)
    )
      e.preventDefault();
  };
  host.addEventListener("keydown", onKey, { signal: abort.signal });
  host.addEventListener("keyup", onKey, { signal: abort.signal });
  host.addEventListener(
    "wheel",
    (e) => {
      if (!scroll || !focused() || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      send({
        kind: "scroll",
        ...scrollPixels(e, host.clientWidth, host.clientHeight),
        ...modifiers(e),
      });
    },
    { signal: abort.signal, passive: false },
  );
  host.addEventListener("blur", reset, { signal: abort.signal });
  win.addEventListener("blur", reset, { signal: abort.signal });
  doc.addEventListener(
    "visibilitychange",
    () => {
      if (doc.hidden) reset();
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    reset();
    if (oldTabIndex === null) host.removeAttribute("tabindex");
    else host.setAttribute("tabindex", oldTabIndex);
    if (oldLabel === null) host.removeAttribute("aria-label");
    else host.setAttribute("aria-label", oldLabel);
    host.style.touchAction = oldTouchAction;
  };
}
