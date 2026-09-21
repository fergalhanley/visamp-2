"use client";
import { useEffect, useRef, useState } from "react";
import type { VisualInputEvent } from "@/lib/sets/protocol";
import { track } from "@/lib/analytics/client";
export function InputController({
  send,
  destination,
}: {
  send: (e: VisualInputEvent | null) => void;
  destination: string;
}) {
  const pad = useRef<HTMLDivElement>(null),
    sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  const [armed, setArmed] = useState(false),
    [keys, setKeys] = useState<string[]>([]),
    [pointer, setPointer] = useState({
      buttons: 0,
      x: 0.5,
      y: 0.5,
      dx: 0,
      dy: 0,
      wheel: 0,
      count: 0,
    }),
    [error, setError] = useState("");
  useEffect(() => {
    const el = pad.current!;
    let captured = false,
      pressed = new Set<string>(),
      frame = 0,
      pending: VisualInputEvent | null = null;
    let buttons = 0;
    const position = { x: 0.5, y: 0.5 };
    const release = () => {
      captured = false;
      pressed = new Set();
      setArmed(false);
      setKeys([]);
      setPointer((p) => ({ ...p, buttons: 0 }));
      sendRef.current(null);
      cancelAnimationFrame(frame);
      frame = 0;
      pending = null;
      buttons = 0;
      if (document.pointerLockElement === el) document.exitPointerLock();
    };
    const lock = () => {
      captured = document.pointerLockElement === el;
      setArmed(captured);
      if (!captured) release();
      else {
        el.focus();
        track("vj_input_capture_started");
      }
    };
    const key = (e: KeyboardEvent) => {
      if (!captured) return;
      if (e.code === "Escape") {
        release();
        return;
      }
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        (e.code.startsWith("F") && /^F\d+$/.test(e.code))
      )
        return;
      if (document.activeElement !== el) {
        release();
        return;
      }
      e.preventDefault();
      const down = e.type === "keydown";
      if (down) pressed.add(e.code);
      else pressed.delete(e.code);
      setKeys([...pressed]);
      sendRef.current({
        type: "key",
        action: down ? "down" : "up",
        code: e.code,
        key: e.key,
        repeat: e.repeat,
        modifiers: e.shiftKey ? ["shift"] : [],
        t: performance.now(),
      });
      setPointer((p) => ({ ...p, count: p.count + 1 }));
    };
    const pointerEvent = (e: PointerEvent) => {
      if (!captured) return;
      e.preventDefault();
      position.x = Math.max(
        0,
        Math.min(1, position.x + e.movementX / el.clientWidth),
      );
      position.y = Math.max(
        0,
        Math.min(1, position.y + e.movementY / el.clientHeight),
      );
      // Pointer Events reports chord changes as moves. Preserve every button edge.
      for (const [mask, button] of [
        [1, 0],
        [2, 2],
        [4, 1],
        [8, 3],
        [16, 4],
      ] as const) {
        if ((buttons & mask) === (e.buttons & mask)) continue;
        const down = !!(e.buttons & mask);
        buttons = down ? buttons | mask : buttons & ~mask;
        sendRef.current({
          type: "pointer",
          action: down ? "down" : "up",
          ...position,
          dx: 0,
          dy: 0,
          button,
          buttons,
          t: performance.now(),
        });
      }
      const event: VisualInputEvent = {
        type: "pointer",
        action:
          e.type === "pointermove"
            ? "move"
            : e.type === "pointerdown"
              ? "down"
              : "up",
        dx: e.movementX,
        dy: e.movementY,
        button: e.button >= 0 ? e.button : undefined,
        buttons: e.buttons,
        ...position,
        t: performance.now(),
      };
      setPointer((p) => ({
        ...p,
        buttons: e.buttons,
        dx: e.movementX,
        dy: e.movementY,
        ...position,
        count: p.count + 1,
      }));
      if (event.action !== "move") {
        return;
      }
      if (pending?.type === "pointer") {
        event.dx += pending.dx;
        event.dy += pending.dy;
      }
      pending = event;
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending) sendRef.current(pending);
          pending = null;
        });
    };
    const wheel = (e: WheelEvent) => {
      if (!captured || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const scale =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      sendRef.current({
        type: "wheel",
        dx: e.deltaX * scale,
        dy: e.deltaY * scale,
        dz: e.deltaZ * scale,
        t: performance.now(),
      });
      setPointer((p) => ({
        ...p,
        wheel: e.deltaY * scale,
        count: p.count + 1,
      }));
    };
    const menu = (e: MouseEvent) => {
      if (captured) e.preventDefault();
    };
    document.addEventListener("pointerlockchange", lock);
    window.addEventListener("blur", release);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    el.addEventListener("pointermove", pointerEvent);
    el.addEventListener("pointerdown", pointerEvent);
    el.addEventListener("pointerup", pointerEvent);
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("contextmenu", menu);
    return () => {
      release();
      document.removeEventListener("pointerlockchange", lock);
      window.removeEventListener("blur", release);
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      el.removeEventListener("pointermove", pointerEvent);
      el.removeEventListener("pointerdown", pointerEvent);
      el.removeEventListener("pointerup", pointerEvent);
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("contextmenu", menu);
    };
  }, [destination]);
  async function capture() {
    try {
      await pad.current?.requestPointerLock();
      setError("");
    } catch {
      setError("Pointer lock was denied. Click again to control output.");
    }
  }
  return (
    <div
      ref={pad}
      className="vj-input"
      role="button"
      tabIndex={0}
      aria-label="Input Controller"
      data-armed={armed}
      onClick={() => {
        if (!armed) void capture();
      }}
      onKeyDown={(e) => {
        if (!armed && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          void capture();
        }
      }}
    >
      <h2>
        {armed ? "INPUT CAPTURED — ESC TO RELEASE" : "Click to control output"}
      </h2>
      <p>
        Escape releases control. Keyboard and pointer input go to the active
        visualisation only while captured.
      </p>
      <p>Destination: {destination}</p>
      <p>
        Keys: {keys.join(", ") || "none"} · Buttons: {pointer.buttons}
      </p>
      <p>
        Position: {pointer.x.toFixed(3)}, {pointer.y.toFixed(3)} · Relative:{" "}
        {pointer.dx}, {pointer.dy}
      </p>
      <p>
        Wheel: {pointer.wheel} · Events: {pointer.count}
      </p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
