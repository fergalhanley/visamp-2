"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import {
  anchoredTimelineScroll,
  snapTimelineTime,
} from "@/lib/sets/timeline-interactions";
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
  transport,
  historyControls,
  saveStatus,
}: {
  transport?: React.ReactNode;
  historyControls?: React.ReactNode;
  saveStatus?: React.ReactNode;
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
  const zoomRef = useRef(75);
  const pointerX = useRef<number | null>(null);
  const pendingScroll = useRef<number | null>(null);
  const changeZoom = useCallback((value: number, x?: number) => {
    const el = scroller.current;
    const next = Math.max(0, Math.min(100, value));
    if (el) {
      pendingScroll.current = anchoredTimelineScroll(
        pendingScroll.current ?? el.scrollLeft,
        x ?? pointerX.current ?? el.clientWidth / 2,
        visibleTimelineMs(zoomRef.current),
        visibleTimelineMs(next),
      );
    }
    zoomRef.current = next;
    setZoom(next);
  }, []);
  useLayoutEffect(() => {
    if (scroller.current && pendingScroll.current !== null) {
      scroller.current.scrollLeft = pendingScroll.current;
      pendingScroll.current = null;
    }
  }, [zoomPercent]);
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
      changeZoom(
        zoomRef.current - event.deltaY * 0.15,
        event.clientX - el.getBoundingClientRect().left,
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
        changeZoom(
          zoomRef.current + Math.log2(next / distance) * 20,
          (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2 -
            el.getBoundingClientRect().left,
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
  }, [changeZoom]);
  const width = (total / 1000) * zoom;
  function move(
    e: React.PointerEvent,
    c: Clip,
    mode: "move" | "left" | "right",
  ) {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget.closest(".set-clip") as HTMLElement | null)?.focus();
    onSelect(c.id);
    const x = e.clientX;
    const original = set;
    const lane = c.media.kind === "audio" ? "audioClips" : "visualClips";
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let result = c;
    const boundaries = [
      position,
      0,
      ...[...set.audioClips, ...set.visualClips]
        .filter((v) => v.id !== c.id)
        .flatMap((v) => [v.startMs, end(v)]),
    ];
    const snap = (n: number, off: boolean, offsets = [0]) =>
      snapTimelineTime(n, boundaries, zoom, off, offsets);
    const update = (ev: PointerEvent) => {
      const delta = ((ev.clientX - x) / zoom) * 1000,
        off = ev.altKey || ev.shiftKey;
      if (mode === "move")
        result = {
          ...c,
          startMs: Math.max(0, snap(c.startMs + delta, off, [0, c.durationMs])),
        };
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
        {transport}
        <label>
          <span className="set-zoom-percent">
            Zoom {Math.round(zoomPercent)}%
          </span>
          <span className="set-zoom-minutes">
            {Math.round(visibleMs / 60000)} min
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={zoomPercent}
            onChange={(e) => changeZoom(Number(e.target.value))}
          />
        </label>
        {historyControls}
        <small>
          Arrows: 1s · Shift+arrows: 10s · Alt/Shift drag: no snap · Pinch to
          zoom
        </small>
        <div className="set-timeline-status">
          {saveStatus}
          <span className="set-timeline-time">
            {timecode(position)} / {timecode(duration(set))}
          </span>
        </div>
      </header>
      <div
        ref={scroller}
        className="set-timeline-scroll"
        onPointerMove={(e) => {
          pointerX.current =
            e.clientX - e.currentTarget.getBoundingClientRect().left;
        }}
      >
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
                e.stopPropagation();
                onSeek(
                  Math.max(
                    0,
                    position + (e.key === "ArrowRight" ? 1000 : -1000),
                  ),
                );
              }
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              const el = e.currentTarget;
              el.focus();
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
                      if (e.key === "Enter") onSelect(c.id);
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
