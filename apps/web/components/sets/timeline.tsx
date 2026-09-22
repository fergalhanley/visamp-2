"use client";
import { useEffect, useRef, useState } from "react";
import {
  type SetContent,
  type Clip,
  type MediaRef,
  duration,
  timecode,
  transitions,
  end,
} from "@/lib/sets/model";
import { visibleTimelineMs } from "@/lib/sets/zoom";
import { DRAG_MEDIA } from "./catalogue";
export function Timeline({
  set,
  onChange,
  onAdd,
  position,
  onSeek,
  selected,
  onSelect,
  unavailable,
}: {
  set: SetContent;
  onChange: (s: SetContent) => void;
  onAdd: (m: MediaRef, start?: number) => void;
  position: number;
  onSeek: (n: number) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  unavailable: Record<string, string>;
}) {
  const [zoomPercent, setZoom] = useState(75);
  const [viewportWidth, setViewportWidth] = useState(1000);
  const [drag, setDrag] = useState<{
    id: string;
    startMs: number;
    durationMs: number;
    sourceOffsetMs: number;
  } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const visibleMs = visibleTimelineMs(zoomPercent);
  const zoom = viewportWidth / (visibleMs / 1000);
  const total = Math.max(visibleMs, duration(set) + 10000);
  const tickSeconds =
    [1, 5, 10, 30, 60, 120, 300, 600, 900].find((n) => n * zoom >= 80) ?? 1800;
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    // Desktop trackpads report pinch gestures as Ctrl+wheel.
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((value) =>
        Math.max(0, Math.min(100, value - event.deltaY * 0.15)),
      );
    };
    let distance = 0;
    const spacing = (e: TouchEvent) =>
      Math.hypot(
        e.touches[0]!.clientX - e.touches[1]!.clientX,
        e.touches[0]!.clientY - e.touches[1]!.clientY,
      );
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) distance = spacing(e);
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const next = spacing(e);
      if (distance > 0 && next > 0)
        setZoom((value) =>
          Math.max(0, Math.min(100, value + Math.log2(next / distance) * 20)),
        );
      distance = next;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
    };
  }, []);
  const width = (total / 1000) * zoom;
  function move(
    e: React.PointerEvent,
    c: Clip,
    mode: "move" | "left" | "right",
  ) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(c.id);
    const x = e.clientX;
    const original = set;
    const lane = c.media.kind === "audio" ? "audioClips" : "visualClips";
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let result = c;
    const boundaries = [
      position,
      ...set[lane]
        .filter((v) => v.id !== c.id)
        .flatMap((v) => [v.startMs, end(v)]),
    ];
    const snap = (n: number, off: boolean) => {
      n = Math.round(n);
      if (off) return n;
      const candidates = [Math.round(n / 1000) * 1000, ...boundaries];
      const closest = candidates.sort(
        (a, b) => Math.abs(a - n) - Math.abs(b - n),
      )[0]!;
      return Math.abs(closest - n) < 8000 / zoom ? closest : n;
    };
    const update = (ev: PointerEvent) => {
      const delta = ((ev.clientX - x) / zoom) * 1000,
        off = ev.altKey || ev.shiftKey;
      if (mode === "move")
        result = { ...c, startMs: Math.max(0, snap(c.startMs + delta, off)) };
      else if (mode === "right") {
        const maximum =
          c.media.kind === "audio" && c.media.durationMs
            ? c.media.durationMs - c.sourceOffsetMs
            : Infinity;
        result = {
          ...c,
          durationMs: Math.min(
            maximum,
            Math.max(1, snap(end(c) + delta, off) - c.startMs),
          ),
        };
      } else {
        const minimum =
          c.media.kind === "audio"
            ? Math.max(0, c.startMs - c.sourceOffsetMs)
            : 0;
        const start = Math.min(
          end(c) - 1,
          Math.max(minimum, snap(c.startMs + delta, off)),
        );
        result = {
          ...c,
          startMs: start,
          durationMs: end(c) - start,
          sourceOffsetMs:
            c.media.kind === "audio" ? c.sourceOffsetMs + start - c.startMs : 0,
        };
      }
      setDrag(result);
    };
    const finish = () => {
      target.removeEventListener("pointermove", update);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
      setDrag(null);
      if (result !== c)
        onChange({
          ...original,
          [lane]: transitions(
            original[lane].map((v) => (v.id === c.id ? result : v)),
            original[lane],
          ),
        });
    };
    const cancel = () => {
      target.removeEventListener("pointermove", update);
      target.removeEventListener("pointerup", finish);
      target.removeEventListener("pointercancel", cancel);
      setDrag(null);
    };
    target.addEventListener("pointermove", update);
    target.addEventListener("pointerup", finish);
    target.addEventListener("pointercancel", cancel);
  }
  return (
    <section className="set-timeline">
      <header>
        <h2>Timeline</h2>
        <span>
          {timecode(position)} / {timecode(duration(set))}
        </span>
        <label>
          Zoom {Math.round(zoomPercent)}% · {Math.round(visibleMs / 60000)} min
          <input
            type="range"
            min="0"
            max="100"
            value={zoomPercent}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <small>
          Hold Alt or Shift to disable snapping · Arrow keys nudge 1 sec · Pinch
          to zoom
        </small>
      </header>
      <div ref={scroller} className="set-timeline-scroll">
        <div style={{ width, minWidth: "100%", position: "relative" }}>
          <div
            className="set-ruler"
            role="slider"
            tabIndex={0}
            aria-label="Timeline position"
            aria-valuemin={0}
            aria-valuemax={duration(set)}
            aria-valuenow={position}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                onSeek(
                  Math.max(
                    0,
                    position + (e.key === "ArrowRight" ? 1000 : -1000),
                  ),
                );
              }
            }}
            onPointerDown={(e) => {
              const el = e.currentTarget;
              const seek = (ev: PointerEvent | React.PointerEvent) =>
                onSeek(
                  Math.max(
                    0,
                    Math.min(
                      duration(set),
                      ((ev.clientX - el.getBoundingClientRect().left) / zoom) *
                        1000,
                    ),
                  ),
                );
              el.setPointerCapture(e.pointerId);
              seek(e);
              const movement = (ev: PointerEvent) => seek(ev);
              const finish = () => {
                el.removeEventListener("pointermove", movement);
                el.removeEventListener("pointerup", finish);
              };
              el.addEventListener("pointermove", movement);
              el.addEventListener("pointerup", finish);
            }}
          >
            {Array.from(
              { length: Math.ceil(total / 1000 / tickSeconds) },
              (_, i) => (
                <span key={i} style={{ left: i * tickSeconds * zoom }}>
                  {timecode(i * (tickSeconds * 1000)).slice(0, 8)}
                </span>
              ),
            )}
          </div>
          {(["audioClips", "visualClips"] as const).map((lane, index) => (
            <div
              key={lane}
              className={`set-lane ${index ? "visual" : "audio"}`}
              aria-label={index ? "Visual lane" : "Audio lane"}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                try {
                  const m = JSON.parse(
                    e.dataTransfer.getData(DRAG_MEDIA),
                  ) as MediaRef;
                  if (m.kind === (index ? "visual" : "audio"))
                    onAdd(
                      m,
                      Math.max(
                        0,
                        Math.round(
                          ((e.clientX -
                            e.currentTarget.getBoundingClientRect().left) /
                            zoom) *
                            1000,
                        ),
                      ),
                    );
                } catch {
                  /* Ignore unrelated drops. */
                }
              }}
            >
              <small>{index ? "◈ Visual" : "♫ Audio"}</small>
              {set[lane].map((c) => {
                const display = drag?.id === c.id ? { ...c, ...drag } : c;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${c.media.title} clip`}
                    aria-pressed={selected === c.id}
                    className={`set-clip ${selected === c.id ? "selected" : ""} ${unavailable[c.media.id] ? "unavailable" : ""}`}
                    style={{
                      left: (display.startMs / 1000) * zoom,
                      width: Math.max(6, (display.durationMs / 1000) * zoom),
                    }}
                    onClick={() => onSelect(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onSelect(c.id);
                    }}
                    onPointerDown={(e) => move(e, c, "move")}
                  >
                    <span
                      className="set-trim left"
                      onPointerDown={(e) => move(e, c, "left")}
                    />
                    <strong>{c.media.title}</strong>
                    <small>{timecode(display.durationMs)}</small>
                    {c.fadeInMs > 0 && (
                      <i
                        style={{
                          left: 0,
                          width: (c.fadeInMs / c.durationMs) * 100 + "%",
                        }}
                      />
                    )}
                    {c.fadeOutMs > 0 && (
                      <i
                        style={{
                          right: 0,
                          width: (c.fadeOutMs / c.durationMs) * 100 + "%",
                        }}
                      />
                    )}
                    <span
                      className="set-trim right"
                      onPointerDown={(e) => move(e, c, "right")}
                    />
                  </div>
                );
              })}
            </div>
          ))}
          <div
            className="set-playhead"
            style={{ left: (position / 1000) * zoom }}
          />
        </div>
      </div>
    </section>
  );
}
