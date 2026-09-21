"use client";
import { useEffect, useRef, useState } from "react";

/** Cursor policy belongs to the real output surface, in either window/iframe. */
export function useOutputPointer() {
  const surface = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    let last: { x: number; y: number } | null = null;
    const isPopout = () => window.self === window.top;
    const fullscreen = () => isPopout() && !!document.fullscreenElement;
    const hide = () => {
      clearTimeout(timer);
      setHidden(true);
    };
    const reveal = () => {
      clearTimeout(timer);
      setHidden(fullscreen());
      if (!fullscreen()) timer = setTimeout(hide, 3000);
    };
    const move = (e: PointerEvent) => {
      if (last?.x === e.clientX && last.y === e.clientY) return;
      last = { x: e.clientX, y: e.clientY };
      reveal();
    };
    const control = (e: Event) =>
      e.target instanceof Element &&
      !!e.target.closest("button,a,input,select");
    const click = (e: MouseEvent) => {
      if (!control(e)) hide();
    };
    const doubleClick = (e: MouseEvent) => {
      if (!isPopout() || control(e)) return;
      if (document.fullscreenElement)
        void document.exitFullscreen().catch(() => {});
      else if (el.requestFullscreen)
        void el.requestFullscreen().catch(() => {});
    };
    timer = setTimeout(hide, 3000);
    el.addEventListener("pointermove", move);
    el.addEventListener("click", click);
    el.addEventListener("dblclick", doubleClick);
    document.addEventListener("fullscreenchange", reveal);
    return () => {
      clearTimeout(timer);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("click", click);
      el.removeEventListener("dblclick", doubleClick);
      document.removeEventListener("fullscreenchange", reveal);
    };
  }, []);
  return { surface, hidden };
}
