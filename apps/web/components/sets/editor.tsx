"use client";
/* eslint-disable @next/next/no-location-assign-relative-destination -- full navigation releases output resources */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { TopBar } from "@/components/chrome/top-bar";
import {
  type SetDocument,
  type SetContent,
  type MediaRef,
  emptySet,
  parseSet,
  clips,
  duration,
  end,
  validate,
  transitions,
} from "@/lib/sets/model";
import { history } from "@/lib/sets/scheduler";
import { request, resolveSet } from "@/lib/sets/client";
import { track } from "@/lib/analytics/client";
import { Catalogue } from "./catalogue";
import { Timeline } from "./timeline";
import { PerformanceView } from "./performance-view";
import { SetPlayback } from "./set-playback";
import { InputController } from "./input-controller";
import { usePerformance } from "./use-performance";
export function SetEditor({ id }: { id: string }) {
  const [h, dispatch] = useReducer(history, {
    past: [],
    present: emptySet(),
    future: [],
  });
  const s = h.present;
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState("Saved"),
    [tab, setTab] = useState<"audio" | "visual">("visual"),
    [selected, setSelected] = useState<string | null>(null),
    [unavailable, setUnavailable] = useState<Record<string, string>>({}),
    [checking, setChecking] = useState(false),
    [height, setHeight] = useState(210);
  const p = usePerformance();
  const pRef = useRef(p);
  useEffect(() => {
    pRef.current = p;
  }, [p]);
  const revision = useRef(""),
    latest = useRef(s),
    saved = useRef(""),
    saving = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    latest.current = s;
  }, [s]);
  const [savedSerial, setSavedSerial] = useState("");
  useEffect(() => {
    let active = true;
    void request<SetDocument>(`/api/sets/${id}`)
      .then(async (doc) => {
        if (!active) return;
        revision.current = doc.updatedAt;
        const content = parseSet(doc);
        saved.current = JSON.stringify(content);
        setSavedSerial(saved.current);
        dispatch({ type: "reset", value: content });
        setLoaded(true);
        track("set_opened");
        setChecking(true);
        const resolved = await pRef.current.load(content);
        if (active) {
          setUnavailable(resolved.unavailable);
          setChecking(false);
        }
      })
      .catch((e) => setError(e.message));
    const stored = localStorage.getItem("visamp-set-timeline-height");
    const prefFrame = requestAnimationFrame(() => {
      if (stored)
        setHeight(Math.min(600, Math.max(200, Number(stored) || 210)));
    });
    return () => {
      active = false;
      cancelAnimationFrame(prefFrame);
    };
  }, [id]);
  const referenceKey = JSON.stringify(clips(s).map((c) => c.media));
  useEffect(() => {
    if (!loaded) return;
    const frame = requestAnimationFrame(() => pRef.current.replaceSet(s));
    return () => cancelAnimationFrame(frame);
  }, [s, loaded]);
  useEffect(() => {
    if (!loaded) return;
    let active = true;
    const timer = setTimeout(() => {
      setChecking(true);
      void pRef.current
        .load(latest.current, true)
        .then((resolved) => {
          if (active) setUnavailable(resolved.unavailable);
        })
        .catch((e) => {
          if (active) setError(String(e));
        })
        .finally(() => {
          if (active) setChecking(false);
        });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [referenceKey, loaded]);
  const save = useCallback(async () => {
    if (saving.current) return saving.current;
    if (JSON.stringify(latest.current) === saved.current) return true;
    const work = async () => {
      setSaveState("Saving…");
      try {
        while (JSON.stringify(latest.current) !== saved.current) {
          const content = latest.current;
          const serial = JSON.stringify(content);
          const doc = await request<SetDocument>(`/api/sets/${id}`, "PUT", {
            content,
            updatedAt: revision.current,
          });
          revision.current = doc.updatedAt;
          saved.current = serial;
          setSavedSerial(serial);
        }
        setSaveState("Saved");
        setError("");
        return true;
      } catch (e) {
        setSaveState("Save failed");
        setError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        saving.current = null;
      }
    };
    saving.current = work();
    return saving.current;
  }, [id]);
  const dirty = loaded && JSON.stringify(s) !== savedSerial;
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => void save(), 600);
    return () => clearTimeout(timer);
  }, [s, dirty, save]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const navigate = (e: MouseEvent) => {
      const target =
        e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (
        target &&
        JSON.stringify(latest.current) !== saved.current &&
        !confirm("Leave with unsaved set changes?")
      )
        e.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, []);
  const change = useCallback((value: SetContent) => {
    pRef.current.send({ action: "pause" });
    dispatch({ type: "edit", value });
  }, []);
  const remove = useCallback(() => {
    if (!selected) return;
    change({
      ...s,
      audioClips: transitions(
        s.audioClips.filter((c) => c.id !== selected),
        s.audioClips,
      ),
      visualClips: transitions(
        s.visualClips.filter((c) => c.id !== selected),
        s.visualClips,
      ),
    });
    setSelected(null);
  }, [selected, s, change]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,textarea,select") ||
          e.target.isContentEditable)
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        pRef.current.send({ action: "pause" });
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (selected && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        remove();
      } else if (
        selected &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        const c = clips(s).find((c) => c.id === selected);
        if (!c) return;
        const lane = c.media.kind === "audio" ? "audioClips" : "visualClips";
        change({
          ...s,
          [lane]: transitions(
            s[lane].map((v) =>
              v.id === selected
                ? {
                    ...v,
                    startMs: Math.max(
                      0,
                      v.startMs + (e.key === "ArrowRight" ? 1000 : -1000),
                    ),
                  }
                : v,
            ),
            s[lane],
          ),
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [selected, remove, s, change]);
  function add(media: MediaRef, start?: number) {
    const lane = media.kind === "audio" ? "audioClips" : "visualClips";
    const startMs = start ?? s[lane].reduce((n, c) => Math.max(n, end(c)), 0);
    const next = s.visualClips
      .filter((c) => c.startMs > startMs)
      .sort((a, b) => a.startMs - b.startMs)[0]?.startMs;
    const durationMs =
      media.kind === "audio"
        ? (media.durationMs ?? 30000)
        : Math.max(
            1000,
            (next ?? (duration(s) > startMs ? duration(s) : startMs + 30000)) -
              startMs,
          );
    const clip = {
      id: crypto.randomUUID(),
      media,
      startMs,
      durationMs,
      sourceOffsetMs: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
    };
    change({ ...s, [lane]: transitions([...s[lane], clip], s[lane]) });
    setSelected(clip.id);
    track("set_clip_added", { type: media.kind });
  }
  const issues = validate(s, unavailable);
  const clip = clips(s).find((c) => c.id === selected);
  async function play() {
    setChecking(true);
    try {
      const resolved = await p.load(s);
      setUnavailable(resolved.unavailable);
      if (
        validate(s, resolved.unavailable).some((i) => i.severity === "error")
      ) {
        track("set_validation_failed");
        setError("Resolve the validation errors before preview.");
        return;
      }
      p.send({
        action: "seek",
        value: Math.min(p.state.positionMs, duration(s)),
      });
      p.send({ action: "play" });
      track("set_preview_started");
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }
  async function openVj() {
    setChecking(true);
    try {
      const resolved = await resolveSet(s);
      setUnavailable(resolved.unavailable);
      const checks = validate(s, resolved.unavailable);
      if (checks.some((i) => i.severity === "error")) {
        setError("Resolve the validation errors before opening VJ Mode.");
        track("set_validation_failed");
        return;
      }
      if (
        checks.length &&
        !confirm(checks.map((i) => i.message).join("\n") + "\nOpen VJ Mode?")
      )
        return;
      if (await save()) {
        track("set_opened_in_vj_mode");
        location.assign(`/vj-mode?set=${id}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setChecking(false);
    }
  }
  if (!loaded)
    return (
      <div className="sets-app">
        <TopBar position="static" />
        <main className="p-8">
          {error ? <p role="alert">{error}</p> : <p>Loading set…</p>}
          <details>
            <summary>Set details</summary>
            <label>
              Description
              <textarea
                value={s.description}
                maxLength={4000}
                onChange={(e) => change({ ...s, description: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={s.loop}
                onChange={(e) => change({ ...s, loop: e.target.checked })}
              />
              Loop by default
            </label>
            <p>16:9 output</p>
          </details>
        </main>
      </div>
    );
  return (
    <div className="sets-app">
      <TopBar position="static" />
      <main className="set-editor">
        <header className="set-editor-bar">
          <a href="/sets">My sets</a>
          <input
            aria-label="Set name"
            maxLength={160}
            value={s.name}
            onChange={(e) => change({ ...s, name: e.target.value })}
          />
          <span role="status">
            {dirty && saveState === "Saved" ? "Saving…" : saveState}
          </span>
          {saveState === "Save failed" && (
            <button onClick={() => void save()}>Retry</button>
          )}
          <button
            disabled={!h.past.length}
            onClick={() => {
              p.send({ action: "pause" });
              dispatch({ type: "undo" });
            }}
          >
            Undo
          </button>
          <button
            disabled={!h.future.length}
            onClick={() => {
              p.send({ action: "pause" });
              dispatch({ type: "redo" });
            }}
          >
            Redo
          </button>
          <button disabled={!loaded || checking} onClick={() => void play()}>
            Preview
          </button>
          <button
            className="set-primary"
            disabled={!loaded || checking}
            onClick={() => void openVj()}
          >
            Open in VJ Mode
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        <div className="set-editor-main">
          <aside>
            <div
              className="set-tabs"
              role="tablist"
              aria-label="Media catalogue"
            >
              <button
                role="tab"
                id="catalogue-tab-visual"
                aria-selected={tab === "visual"}
                aria-controls="catalogue-panel"
                tabIndex={tab === "visual" ? 0 : -1}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? "visual"
                        : e.key === "End"
                          ? "audio"
                          : tab === "visual"
                            ? "audio"
                            : "visual";
                    setTab(next);
                    document.getElementById(`catalogue-tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setTab("visual")}
              >
                Visualisations
              </button>
              <button
                role="tab"
                id="catalogue-tab-audio"
                aria-selected={tab === "audio"}
                aria-controls="catalogue-panel"
                tabIndex={tab === "audio" ? 0 : -1}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? "visual"
                        : e.key === "End"
                          ? "audio"
                          : tab === "visual"
                            ? "audio"
                            : "visual";
                    setTab(next);
                    document.getElementById(`catalogue-tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setTab("audio")}
              >
                Audio
              </button>
            </div>
            <div
              id="catalogue-panel"
              role="tabpanel"
              aria-labelledby={`catalogue-tab-${tab}`}
              className="set-catalogue-panel"
            >
              <Catalogue
                kind={tab}
                onAdd={add}
                onPreview={(m) => void p.override(m.kind, m)}
              />
            </div>
          </aside>
          <div className="set-editor-preview">
            <PerformanceView
              performance={p}
              onPopout
              poppedOut={
                <InputController send={p.input} destination={p.status} />
              }
              controls={
                <SetPlayback
                  performance={p}
                  disabled={checking}
                  onPlay={() => void play()}
                />
              }
            />
          </div>
        </div>
        <div
          role="separator"
          aria-label="Timeline height"
          aria-orientation="horizontal"
          tabIndex={0}
          className="set-divider"
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              const n = Math.max(
                200,
                Math.min(600, height + (e.key === "ArrowUp" ? 20 : -20)),
              );
              setHeight(n);
              localStorage.setItem("visamp-set-timeline-height", String(n));
            }
          }}
          onPointerDown={(e) => {
            const y = e.clientY,
              h = height,
              el = e.currentTarget;
            el.setPointerCapture(e.pointerId);
            const move = (ev: PointerEvent) => {
              const n = Math.max(200, Math.min(600, h + y - ev.clientY));
              setHeight(n);
              localStorage.setItem("visamp-set-timeline-height", String(n));
            };
            const up = () => {
              el.removeEventListener("pointermove", move);
              el.removeEventListener("pointerup", up);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", up);
          }}
        />
        <div className="set-editor-timeline" style={{ height, minHeight: 200 }}>
          <Timeline
            set={s}
            onChange={change}
            onAdd={add}
            position={p.state.positionMs}
            onSeek={(n) => {
              p.send({ action: "pause" });
              p.send({ action: "seek", value: n });
            }}
            selected={selected}
            onSelect={setSelected}
            unavailable={unavailable}
          />
        </div>
        <details>
          <summary>Set details</summary>
          <label>
            Description
            <textarea
              value={s.description}
              maxLength={4000}
              onChange={(e) => change({ ...s, description: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={s.loop}
              onChange={(e) => change({ ...s, loop: e.target.checked })}
            />
            Loop by default
          </label>
          <p>16:9 output</p>
        </details>
        <details className="set-editor-details">
          <summary>
            Clip timings & validation{" "}
            {issues.length ? `(${issues.length})` : "— Ready"}
          </summary>{" "}
          <aside className="set-inspector">
            <h2>Clip inspector</h2>
            {clip ? (
              <>
                <h3>{clip.media.title}</h3>
                <small>{clip.media.attribution}</small>
                {(
                  [
                    "startMs",
                    "sourceOffsetMs",
                    "durationMs",
                    "fadeInMs",
                    "fadeOutMs",
                  ] as const
                )
                  .filter(
                    (k) =>
                      clip.media.kind === "audio" || k !== "sourceOffsetMs",
                  )
                  .map((k) => (
                    <label key={k}>
                      {
                        {
                          startMs: "Start",
                          sourceOffsetMs: "Source offset",
                          durationMs: "Duration",
                          fadeInMs: "Fade in",
                          fadeOutMs: "Fade out",
                        }[k]
                      }{" "}
                      (ms)
                      <input
                        type="number"
                        step="1"
                        value={clip[k]}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isSafeInteger(n)) return;
                          const lane =
                            clip.media.kind === "audio"
                              ? "audioClips"
                              : "visualClips";
                          const next = s[lane].map((c) =>
                            c.id === clip.id ? { ...c, [k]: n } : c,
                          );
                          change({
                            ...s,
                            [lane]:
                              k === "startMs" || k === "durationMs"
                                ? transitions(next, s[lane])
                                : next,
                          });
                        }}
                      />
                    </label>
                  ))}
                <button onClick={remove}>Remove clip</button>
              </>
            ) : (
              <p>
                Select a clip to edit exact timings. Drag media onto its lane,
                or choose Add.
              </p>
            )}
            <h3>Validation</h3>
            {checking ? (
              <p>Checking content…</p>
            ) : !issues.length ? (
              <p>Ready</p>
            ) : (
              issues.map((i, n) => (
                <p
                  key={n}
                  className={
                    i.severity === "error" ? "set-error" : "set-warning"
                  }
                >
                  {i.severity === "error" ? "Error" : "Warning"}: {i.message}
                </p>
              ))
            )}
          </aside>
        </details>
      </main>
    </div>
  );
}
