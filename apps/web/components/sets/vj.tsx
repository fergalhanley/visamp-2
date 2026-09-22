"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { TopBar } from "@/components/chrome/top-bar";
import { request } from "@/lib/sets/client";
import {
  type SetDocument,
  validate,
  duration,
  timecode,
} from "@/lib/sets/model";
import { SetPlayback } from "./set-playback";
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
  const requestedSet = useRef<string | null>(null);
  useEffect(() => {
    live.current = p;
  }, [p]);
  const [sets, setSets] = useState<SetDocument[]>([]),
    [listLoading, setListLoading] = useState(true),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState(initialId ?? ""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [manual, setManual] = useState(!initialId),
    [unavailable, setUnavailable] = useState<Record<string, string>>({}),
    [widths, setWidths] = useState([300, 320]),
    [previewHeight, setPreviewHeight] = useState(380),
    [workspaceTab, setWorkspaceTab] = useState(initialId ? "set" : "freeplay");
  const freeplay = useFreeplay(p, workspaceTab === "freeplay");
  const audioLibrary = useVjAudioLibrary(
    (media, context) => freeplay.select("audio", media, context),
    p.state.audioOverride?.media,
    p.state.playing,
  );
  useEffect(() => {
    void request<{ sets: SetDocument[] }>("/api/sets")
      .then((d) => setSets(d.sets))
      .catch((e) => setError(e.message))
      .finally(() => setListLoading(false));
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
    requestedSet.current = id;
    setLoading(true);
    setError("");
    live.current.send({ action: "stop" });
    try {
      const set = await request<SetDocument>(`/api/sets/${id}`);
      const resolved = await live.current.load(set);
      setUnavailable(resolved.unavailable);
      setSelected(id);
      const issues = validate(set, resolved.unavailable).filter(
        (i) => i.severity === "error",
      );
      if (issues.length) {
        setError(issues.map((i) => i.message).join(" "));
        setManual(false);
        return;
      }
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
    if (initialId && requestedSet.current !== initialId)
      void load(initialId, false);
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
      <TopBar position="static" actions={false} />
      <main
        className={`vj-workspace${workspaceTab === "set" ? " vj-workspace-set" : ""}`}
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
                className={`cursor-pointer -mb-px border-b-2 py-3 text-sm transition ${workspaceTab === tab ? "border-fuchsia-400 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
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
            className="vj-set-library"
          >
            <input
              aria-label="Search sets"
              placeholder="Search your sets"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="mb-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            />
            <ul aria-label="Your sets" className="space-y-2">
              {sets
                .filter((s) =>
                  s.name.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((set) => (
                  <li key={set.id} className="relative">
                    <button
                      type="button"
                      disabled={loading}
                      aria-pressed={!manual && selected === set.id}
                      onClick={() => void load(set.id)}
                      className={`cursor-pointer w-full rounded-lg border p-4 pr-24 text-left transition hover:bg-white/5 disabled:opacity-50 ${!manual && selected === set.id ? "border-fuchsia-400/60 bg-fuchsia-400/10" : "border-white/10"}`}
                    >
                      <span className="block truncate font-medium">
                        {set.name}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {timecode(duration(set)).slice(0, -4)} ·{" "}
                        {set.visualClips.length} visualisations ·{" "}
                        {set.audioClips.length} tracks
                      </span>
                    </button>
                    <a
                      href={`/sets/${set.id}/edit`}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs underline hover:text-fuchsia-300"
                    >
                      Edit Set
                    </a>
                  </li>
                ))}
            </ul>
            {!listLoading && !sets.length && (
              <p className="p-4 text-sm text-muted-foreground">
                No sets yet. Create one in Set Builder.
              </p>
            )}
            {sets.length > 0 &&
              !sets.some((s) =>
                s.name.toLowerCase().includes(filter.toLowerCase()),
              ) && (
                <p className="p-4 text-sm text-muted-foreground">
                  No matching sets.
                </p>
              )}
            {(loading || listLoading) && (
              <p role="status" className="p-4 text-sm text-muted-foreground">
                Loading set…
              </p>
            )}
          </div>
        </section>
        {divider(1)}
        <div className="vj-performance vj-player-performance">
          <PerformanceView
            performance={p}
            controls={
              workspaceTab === "freeplay" ? (
                <Transport controller={freeplay.controller} />
              ) : (
                false
              )
            }
            poppedOut={
              <InputController send={p.input} destination={p.status} />
            }
            manual={manual}
            outputHeight={
              workspaceTab === "freeplay" ? previewHeight : undefined
            }
            divider={
              workspaceTab === "freeplay" && (
                <ResizeHandle
                  label="Preview height"
                  value={previewHeight}
                  onChange={(n) => {
                    setPreviewHeight(n);
                    localStorage.setItem("visamp-vj-preview-height", String(n));
                  }}
                />
              )
            }
            onPopout
            play={() => {
              if (!manual && invalid) {
                setError("Choose a valid set to play.");
                setWorkspaceTab("set");
                return;
              }
              p.send({ action: "play" });
              track("vj_set_started");
            }}
          />
        </div>
        {workspaceTab === "set" && (
          <div className="vj-set-playback">
            <SetPlayback
              performance={p}
              disabled={manual || invalid || loading}
              error={error}
              onPlay={() => {
                p.send({ action: "play" });
                track("vj_set_started");
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
