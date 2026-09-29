"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Timeline } from "@/components/sets/timeline";
import { DRAG_MEDIA } from "@/lib/sets/drag-media";
import {
  clips,
  end,
  transitions,
  type MediaRef,
  type SetContent,
} from "@/lib/sets/model";
import {
  history,
  type History,
  type HistoryAction,
} from "@/lib/sets/scheduler";
import { request } from "@/lib/sets/client";
import {
  emptyVideo,
  type VideoCatalogueItem,
  type VideoContent,
  type VideoDocument,
} from "@/lib/videos/model";
import { applyVideoTimeline, videoTimeline } from "@/lib/videos/timeline";

type Draft = { title: string; content: VideoContent };
const reduce = (state: History<Draft>, action: HistoryAction<Draft>) =>
  history(state, action);
const serial = (draft: Draft) =>
  JSON.stringify({ title: draft.title, content: draft.content });

export function VideoMaker({
  id,
  onDirty,
  onSaved,
}: {
  id: string;
  onDirty: (dirty: boolean) => void;
  onSaved: (video: VideoDocument) => void;
}) {
  const [h, dispatch] = useReducer(reduce, {
    past: [],
    present: { title: "", content: emptyVideo() },
    future: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [catalogue, setCatalogue] = useState<VideoCatalogueItem[]>([]);
  const [error, setError] = useState("");
  const [catalogueError, setCatalogueError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const revision = useRef("");
  const saveLock = useRef(false);
  const dirty = loaded && serial(h.present) !== saved;
  const timeline = videoTimeline(h.present.content);
  const selectedClip = clips(timeline).find((clip) => clip.id === selected);

  useEffect(() => {
    let active = true;
    void request<{ video: VideoDocument }>(`/api/studio/videos/${id}`)
      .then(({ video }) => {
        if (!active) return;
        const draft = { title: video.title, content: video.content };
        dispatch({ type: "reset", value: draft });
        revision.current = video.updatedAt;
        setSaved(serial(draft));
        setLoaded(true);
      })
      .catch((cause) => {
        if (active) setError(String(cause.message ?? cause));
      });
    void request<{ items: VideoCatalogueItem[] }>(
      "/api/studio/videos/catalogue",
    )
      .then(({ items }) => {
        if (active) setCatalogue(items);
      })
      .catch((cause) => {
        if (active) setCatalogueError(String(cause.message ?? cause));
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const navigate = (event: MouseEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("a[href]") &&
        !window.confirm("Leave with unsaved video changes?")
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", navigate, true);
    };
  }, [dirty]);

  function change(next: SetContent) {
    if (saveLock.current) return;
    try {
      dispatch({
        type: "edit",
        value: {
          ...h.present,
          content: applyVideoTimeline(h.present.content, next),
        },
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid clip edit.");
    }
  }
  function add(reference: MediaRef, start?: number) {
    if (saveLock.current) return;
    // Drag payloads are untrusted; only use canonical catalogue entries.
    const item = catalogue.find(
      ({ media }) => media.id === reference.id && media.kind === reference.kind,
    );
    if (!item) {
      setError("Choose a track or visual from this video's catalogue.");
      return;
    }
    const media = item.media;
    const lane = media.kind === "audio" ? "audioClips" : "visualClips";
    const clip = {
      id: crypto.randomUUID(),
      media,
      startMs: start ?? timeline[lane].reduce((n, c) => Math.max(n, end(c)), 0),
      durationMs:
        media.kind === "audio"
          ? Math.min(media.durationMs ?? 30000, 30000)
          : 30000,
      sourceOffsetMs: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
    };
    change({
      ...timeline,
      [lane]: transitions([...timeline[lane], clip], timeline[lane]),
    });
    setSelected(clip.id);
  }
  async function save() {
    if (saveLock.current || !dirty) return;
    saveLock.current = true;
    setSaving(true);
    setError("");
    try {
      const { video } = await request<{ video: VideoDocument }>(
        `/api/studio/videos/${id}`,
        "PUT",
        { ...h.present, updatedAt: revision.current },
      );
      const draft = { title: video.title, content: video.content };
      revision.current = video.updatedAt;
      dispatch({ type: "edit", value: draft });
      setSaved(serial(draft));
      onSaved(video);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save video.",
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  if (!loaded)
    return <p role={error ? "alert" : "status"}>{error || "Loading video…"}</p>;
  return (
    <fieldset disabled={saving} className="video-maker set-editor">
      <div className="set-editor-bar">
        <label>
          Video title{" "}
          <input
            maxLength={160}
            value={h.present.title}
            onChange={(event) =>
              dispatch({
                type: "edit",
                value: { ...h.present, title: event.target.value },
              })
            }
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save video"}
        </button>
        <span role="status">{dirty ? "Unsaved changes" : "Saved"}</span>
      </div>
      {error && (
        <p role="alert" className="p-3 text-destructive">
          {error}
        </p>
      )}
      {catalogueError && (
        <p role="alert" className="p-3 text-destructive">
          {catalogueError}
        </p>
      )}
      <div className="grid gap-4 p-4 md:grid-cols-2">
        {(["audio", "visual"] as const).map((kind) => (
          <section
            key={kind}
            aria-label={kind === "audio" ? "Your tracks" : "Eligible visuals"}
          >
            <h2>
              {kind === "audio" ? "Your tracks" : "Visuals for your video"}
            </h2>
            <div className="mt-2 max-h-64 overflow-auto">
              {catalogue
                .filter((item) => item.media.kind === kind)
                .map((item) => (
                  <div
                    key={item.media.id}
                    className="flex items-center justify-between gap-3 border-b py-2"
                    draggable={!saving}
                    onDragStart={(event) =>
                      event.dataTransfer.setData(
                        DRAG_MEDIA,
                        JSON.stringify(item.media),
                      )
                    }
                  >
                    <div>
                      <p>{item.media.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.media.attribution}
                        {kind === "visual"
                          ? ` · ${item.distribution === "product" ? `${item.priceCredits} credits · licence required for export` : "Free video use"}`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Add ${item.media.title}`}
                      onClick={() => add(item.media)}
                    >
                      Add
                    </button>
                  </div>
                ))}
              {!catalogue.some((item) => item.media.kind === kind) && (
                <p className="py-4 text-sm text-muted-foreground">
                  {kind === "audio"
                    ? "Your playable uploaded tracks will appear here."
                    : "No eligible visuals available."}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      <Timeline
        set={timeline}
        onChange={change}
        onAdd={add}
        position={position}
        onSeek={setPosition}
        selected={selected}
        onSelect={setSelected}
        unavailable={{}}
        saveStatus={
          <span>Drag clips to move them; drag their edges to trim.</span>
        }
        historyControls={
          <>
            <button
              type="button"
              onClick={() => dispatch({ type: "undo" })}
              disabled={!h.past.length}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: "redo" })}
              disabled={!h.future.length}
            >
              Redo
            </button>
          </>
        }
      />
      {selectedClip && (
        <div className="set-inspector p-4">
          <p>
            {selectedClip.media.title} · {selectedClip.media.attribution}
          </p>
          {(
            [
              "startMs",
              "durationMs",
              ...(selectedClip.media.kind === "audio"
                ? (["sourceOffsetMs"] as const)
                : []),
            ] as const
          ).map((field) => (
            <label key={field}>
              {field === "startMs"
                ? "Start"
                : field === "durationMs"
                  ? "Duration"
                  : "Track offset"}{" "}
              (seconds)
              <input
                type="number"
                min={field === "durationMs" ? 0.001 : 0}
                step="0.001"
                value={selectedClip[field] / 1000}
                onChange={(event) => {
                  const lane =
                    selectedClip.media.kind === "audio"
                      ? "audioClips"
                      : "visualClips";
                  change({
                    ...timeline,
                    [lane]: transitions(
                      timeline[lane].map((clip) =>
                        clip.id === selected
                          ? {
                              ...clip,
                              [field]: Math.round(
                                Number(event.target.value) * 1000,
                              ),
                            }
                          : clip,
                      ),
                      timeline[lane],
                    ),
                  });
                }}
              />
            </label>
          ))}
          <button
            type="button"
            onClick={() => {
              change({
                ...timeline,
                audioClips: transitions(
                  timeline.audioClips.filter((clip) => clip.id !== selected),
                  timeline.audioClips,
                ),
                visualClips: transitions(
                  timeline.visualClips.filter((clip) => clip.id !== selected),
                  timeline.visualClips,
                ),
              });
              setSelected(null);
            }}
          >
            Remove clip
          </button>
        </div>
      )}
    </fieldset>
  );
}
