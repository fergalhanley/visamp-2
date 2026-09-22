"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { TopBar } from "@/components/chrome/top-bar";
import { request } from "@/lib/sets/client";
import { type SetDocument, validate, emptySet } from "@/lib/sets/model";
import { parseState } from "@/lib/sets/protocol";
import { track } from "@/lib/analytics/client";
import { VPanel } from "@/components/panels/v-panel";
import { APanel } from "@/components/panels/a-panel";
import { useVjAudioLibrary } from "./use-vj-audio-library";
import { usePerformance } from "./use-performance";
import { PerformanceView } from "./performance-view";
import { ResizeHandle } from "./resize-handle";
import { Transport } from "@/components/chrome/transport";
import { useFreeplay, visualRef, hostedRef } from "./use-freeplay";
import { InputController } from "./input-controller";
export function VjMode() {
  const query = useSearchParams(),
    initialId = query.get("set");
  const { user } = useAuth();
  const resumeKey = `visamp-vj-resume:${user?.id ?? "signed-out"}`;
  const p = usePerformance();
  const live = useRef(p);
  useEffect(() => {
    live.current = p;
  }, [p]);
  const [sets, setSets] = useState<SetDocument[]>([]),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState(initialId ?? ""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [manual, setManual] = useState(!initialId),
    [unavailable, setUnavailable] = useState<Record<string, string>>({}),
    [widths, setWidths] = useState([300, 320]),
    [previewHeight, setPreviewHeight] = useState(380),
    [workspaceTab, setWorkspaceTab] = useState(initialId ? "set" : "freeplay"),
    [resume, setResume] = useState<ReturnType<typeof parseState>>(null);
  const freeplay = useFreeplay(p, workspaceTab === "freeplay");
  const audioLibrary = useVjAudioLibrary(
    (media, context) => freeplay.select("audio", media, context),
    p.state.audioOverride?.media,
    p.state.playing,
  );
  useEffect(() => {
    void request<{ sets: SetDocument[] }>("/api/sets")
      .then((d) => setSets(d.sets))
      .catch((e) => setError(e.message));
    track("vj_session_started");
    const prefFrame = requestAnimationFrame(() => {
      try {
        const height = Number(localStorage.getItem("visamp-vj-preview-height"));
        if (height) setPreviewHeight(Math.max(220, Math.min(650, height)));
        const w = JSON.parse(
          localStorage.getItem("visamp-vj-widths") ?? "null",
        );
        if (Array.isArray(w) && w.length === 2)
          setWidths(
            w.map((n) => Math.max(200, Math.min(450, Number(n) || 250))),
          );
        const old = JSON.parse(localStorage.getItem(resumeKey) ?? "null");
        if (old) setResume(parseState(old));
      } catch {
        /* Optional browser preferences. */
      }
    });
    return () => cancelAnimationFrame(prefFrame);
  }, [resumeKey]);
  async function load(id: string, ask = true) {
    if (
      ask &&
      live.current.state.playing &&
      !confirm("Stop the current output and load another set?")
    )
      return;
    setLoading(true);
    setError("");
    live.current.send({ action: "stop" });
    try {
      const set = await request<SetDocument>(`/api/sets/${id}`);
      const resolved = await live.current.load(set);
      setUnavailable(resolved.unavailable);
      const issues = validate(set, resolved.unavailable);
      if (issues.some((i) => i.severity === "error")) {
        setError(issues.map((i) => i.message).join(" "));
        setManual(false);
        return;
      }
      if (issues.length) setError(issues.map((i) => i.message).join(" "));
      setSelected(id);
      setManual(false);
      history.replaceState(null, "", `/vj-mode?set=${id}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (initialId) void load(initialId, false);
  }, [initialId]); // load only the requested initial programme
  useEffect(() => {
    const timer = setInterval(() => {
      try {
        localStorage.setItem(resumeKey, JSON.stringify(live.current.state));
      } catch {
        /* Browser storage can be unavailable. */
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [resumeKey]);
  function divider(index: number) {
    return (
      <div
        role="separator"
        tabIndex={0}
        aria-label={index ? "Audio column width" : "Visual column width"}
        aria-orientation="vertical"
        className="vj-divider"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const w = [...widths];
            w[index] = Math.max(
              200,
              Math.min(450, w[index]! + (e.key === "ArrowRight" ? 10 : -10)),
            );
            setWidths(w);
            localStorage.setItem("visamp-vj-widths", JSON.stringify(w));
          }
        }}
        onPointerDown={(e) => {
          const x = e.clientX,
            old = widths[index]!,
            el = e.currentTarget;
          el.setPointerCapture(e.pointerId);
          const move = (ev: PointerEvent) => {
            const w = [...widths];
            w[index] = Math.max(200, Math.min(450, old + ev.clientX - x));
            setWidths(w);
            localStorage.setItem("visamp-vj-widths", JSON.stringify(w));
          };
          const end = () => {
            el.removeEventListener("pointermove", move);
            el.removeEventListener("pointerup", end);
          };
          el.addEventListener("pointermove", move);
          el.addEventListener("pointerup", end);
        }}
      />
    );
  }
  const invalid = validate(p.state.set, unavailable).some(
    (i) => i.severity === "error",
  );
  return (
    <div className="sets-app">
      <TopBar position="static" />
      <main
        className="vj-workspace"
        style={
          {
            "--visual-width": `${widths[0]}px`,
            "--audio-width": `${widths[1]}px`,
          } as React.CSSProperties
        }
      >
        <section className="vj-library" aria-label="Performance library">
          <div
            role="tablist"
            aria-label="Performance mode"
            className="flex shrink-0 gap-6 border-b px-4"
          >
            {(["freeplay", "set"] as const).map((tab) => (
              <button
                key={tab}
                id={`vj-tab-${tab}`}
                role="tab"
                aria-selected={workspaceTab === tab}
                aria-controls={`vj-panel-${tab}`}
                tabIndex={workspaceTab === tab ? 0 : -1}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? "freeplay"
                        : e.key === "End"
                          ? "set"
                          : tab === "set"
                            ? "freeplay"
                            : "set";
                    setWorkspaceTab(next);
                    document.getElementById(`vj-tab-${next}`)?.focus();
                  }
                }}
                onClick={() => setWorkspaceTab(tab)}
                className={`-mb-px border-b-2 py-3 text-sm transition ${workspaceTab === tab ? "border-fuchsia-400 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab === "freeplay" ? "Freeplay" : "Set"}
              </button>
            ))}
          </div>
          <div
            id="vj-panel-freeplay"
            role="tabpanel"
            aria-labelledby="vj-tab-freeplay"
            hidden={workspaceTab !== "freeplay"}
            className="vj-freeplay"
          >
            <VPanel
              embedded
              activeId={p.state.visualOverride?.media.id}
              onSelect={(vis, context) =>
                void freeplay.select(
                  "visual",
                  visualRef(vis),
                  context.map(visualRef),
                )
              }
            />
            {divider(0)}
            <APanel
              embedded
              library={audioLibrary.library}
              hostedPlayback={{
                id:
                  p.state.audioOverride?.media.source === "hosted"
                    ? p.state.audioOverride.media.id
                    : undefined,
                playing: p.state.playing,
              }}
              onHostedSelect={(t, context) =>
                void freeplay.select(
                  "audio",
                  hostedRef(t),
                  context.map(hostedRef),
                )
              }
            />
            {audioLibrary.error && (
              <p role="alert" className="col-span-full text-destructive">
                {audioLibrary.error}
              </p>
            )}
          </div>
          <div
            id="vj-panel-set"
            role="tabpanel"
            aria-labelledby="vj-tab-set"
            hidden={workspaceTab !== "set"}
            className="vj-set-controls"
          >
            <div className="vj-controls">
              <input
                aria-label="Search sets"
                placeholder="Search your sets"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select
                aria-label="Choose set"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Choose a set</option>
                {sets
                  .filter((s) =>
                    s.name.toLowerCase().includes(filter.toLowerCase()),
                  )
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button
                disabled={!selected || loading}
                onClick={() => void load(selected)}
              >
                Load set
              </button>
              <button
                onClick={() => {
                  if (
                    p.state.playing &&
                    !confirm("Stop and start without a set?")
                  )
                    return;
                  p.send({ action: "stop" });
                  p.replaceSet(emptySet());
                  setUnavailable({});
                  setError("");
                  setManual(true);
                  setSelected("");
                  setWorkspaceTab("freeplay");
                  history.replaceState(null, "", "/vj-mode");
                }}
              >
                Start without a set
              </button>
              <strong>
                {manual ? "Manual performance" : p.state.set.name}
              </strong>
              <button
                disabled={!manual && invalid}
                onClick={() => p.send({ action: "restart" })}
              >
                Restart set
              </button>
            </div>
            {resume && (
              <p className="vj-controls">
                Resume your last session near{" "}
                {Math.floor(resume.positionMs / 1000)} seconds?{" "}
                <button
                  onClick={async () => {
                    const old = resume;
                    const resolved = await p.load(old.set);
                    if (
                      validate(old.set, resolved.unavailable).some(
                        (i) => i.severity === "error",
                      )
                    ) {
                      setError(
                        "Previous session content is unavailable. Repair its set first.",
                      );
                      return;
                    }
                    p.send({ action: "seek", value: old.positionMs });
                    p.send({ action: "play" });
                    setResume(null);
                  }}
                >
                  Resume
                </button>
                <button onClick={() => setResume(null)}>Dismiss</button>
              </p>
            )}
            {error && (
              <p role="alert" className="vj-controls">
                {error}
              </p>
            )}
            {loading && <p>Loading set…</p>}
          </div>
        </section>
        {divider(1)}
        <div
          className={
            workspaceTab === "freeplay"
              ? "vj-performance vj-freeplay-performance"
              : "vj-performance"
          }
        >
          <PerformanceView
            performance={p}
            controls={
              workspaceTab === "freeplay" ? (
                <Transport controller={freeplay.controller} />
              ) : undefined
            }
            poppedOut={
              <InputController send={p.input} destination={p.status} />
            }
            manual={manual}
            outputHeight={previewHeight}
            divider={
              <ResizeHandle
                label="Preview height"
                value={previewHeight}
                onChange={(n) => {
                  setPreviewHeight(n);
                  localStorage.setItem("visamp-vj-preview-height", String(n));
                }}
              />
            }
            onPopout
            play={() => {
              if (!manual && invalid) {
                setError("Load a valid set or choose Start without a set.");
                setWorkspaceTab("set");
                return;
              }
              p.send({ action: "play" });
              track("vj_set_started");
            }}
          />
        </div>
      </main>
    </div>
  );
}
