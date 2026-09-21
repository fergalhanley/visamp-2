"use client";
import { VisualPlaylists } from "@/components/panels/visual-playlists";
import { useAuth } from "@/components/auth/auth-provider";
import { useState } from "react";
import { useBrowseVisualisations } from "@/hooks/use-browse";
import { useMyVisualisations } from "@/hooks/use-my-visualisations";
import { useFavouriteVisualisations } from "@/hooks/use-favourite-visualisations";
import { MusicLibrary } from "@/components/panels/music-library";
import { type MediaRef } from "@/lib/sets/model";
import { fileRef, request } from "@/lib/sets/client";
export const DRAG_MEDIA = "application/x-visamp-set-media";
export function Catalogue({
  kind,
  onAdd,
  onPreview,
}: {
  kind: "audio" | "visual";
  onAdd: (m: MediaRef) => void;
  onPreview: (m: MediaRef) => void;
}) {
  const { user } = useAuth();
  const browse = useBrowseVisualisations(),
    mine = useMyVisualisations(),
    favourites = useFavouriteVisualisations();
  const [filter, setFilter] = useState(""),
    [tab, setTab] = useState("public"),
    [source, setSource] = useState("hosted"),
    [url, setUrl] = useState(""),
    [external, setExternal] = useState<MediaRef[]>([]),
    [error, setError] = useState("");
  const list =
    tab === "mine" ? mine : tab === "favourites" ? favourites : browse;
  const items: MediaRef[] =
    kind === "visual"
      ? (list.items ?? []).map((v) => ({
          id: v.id,
          kind: "visual",
          source: "visual",
          title: v.title,
          attribution: v.creator.username,
        }))
      : external.filter((m) => m.source === source);
  return (
    <section
      className="set-catalogue"
      aria-label={
        kind === "visual" ? "Visualisations catalogue" : "Audio catalogue"
      }
    >
      <h2>{kind === "visual" ? "Visualisations" : "Audio"}</h2>
      {kind === "audio" ? (
        <>
          <label>
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="hosted">VisAmp</option>
              <option value="soundcloud">SoundCloud</option>
              <option value="file">My Files</option>
            </select>
          </label>
          {source === "hosted" ? (
            <MusicLibrary
              onSelect={(t) =>
                onAdd({
                  id: t.id,
                  kind: "audio",
                  source: "hosted",
                  title: t.title,
                  attribution: t.artist,
                  durationMs: t.durationMs,
                })
              }
              onPreview={(t) =>
                onPreview({
                  id: t.id,
                  kind: "audio",
                  source: "hosted",
                  title: t.title,
                  attribution: t.artist,
                  durationMs: t.durationMs,
                })
              }
            />
          ) : source === "file" ? (
            <label>
              Choose audio files
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={async (e) => {
                  try {
                    const refs = await Promise.all(
                      Array.from(e.target.files ?? []).map(fileRef),
                    );
                    setExternal(refs);
                    setError("");
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              />
            </label>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const data = await request<{
                    tracks: {
                      id: number;
                      title: string;
                      durationMs: number;
                      artist: string;
                    }[];
                  }>("/api/soundcloud/resolve", "POST", { url });
                  setExternal(
                    data.tracks.map((t) => ({
                      id: String(t.id),
                      kind: "audio",
                      source: "soundcloud",
                      title: t.title,
                      attribution: t.artist,
                      durationMs: t.durationMs,
                    })),
                  );
                  setError("");
                } catch (e) {
                  setError(String(e));
                }
              }}
            >
              <label>
                SoundCloud playlist URL
                <input value={url} onChange={(e) => setUrl(e.target.value)} />
              </label>
              <button>Load</button>
            </form>
          )}
        </>
      ) : (
        <label>
          Library
          <select value={tab} onChange={(e) => setTab(e.target.value)}>
            <option value="public">Public visualisations</option>
            <option value="mine">My visualisations</option>
            <option value="favourites">Favourites</option>
            <option value="playlists">Playlists</option>
          </select>
        </label>
      )}
      {(kind === "visual" || source !== "hosted") && (
        <>
          <input
            aria-label={`Filter ${kind}`}
            placeholder="Filter title or creator"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {kind === "visual" && tab === "playlists" && user ? (
            <VisualPlaylists
              userId={user.id}
              query={filter}
              renderItem={(vis) => {
                const m: MediaRef = {
                  id: vis.id,
                  kind: "visual",
                  source: "visual",
                  title: vis.title,
                  attribution: vis.creator.username,
                };
                return (
                  <div
                    className="flex items-center gap-2 p-2"
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(DRAG_MEDIA, JSON.stringify(m))
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <strong>{vis.title}</strong>
                      <small className="block">{vis.creator.username}</small>
                    </div>
                    <button onClick={() => onAdd(m)}>Add</button>
                    <button onClick={() => onPreview(m)}>Preview</button>
                  </div>
                );
              }}
            />
          ) : (
            <div className="set-catalogue-items">
              {items
                .filter((m) =>
                  `${m.title} ${m.attribution}`
                    .toLowerCase()
                    .includes(filter.toLowerCase()),
                )
                .map((m) => (
                  <article
                    key={m.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(DRAG_MEDIA, JSON.stringify(m))
                    }
                  >
                    <strong>{m.title}</strong>
                    <small>{m.attribution}</small>
                    <div>
                      <button onClick={() => onAdd(m)}>Add</button>
                      <button onClick={() => onPreview(m)}>Preview</button>
                    </div>
                  </article>
                ))}
            </div>
          )}
        </>
      )}
      {(error || (kind === "visual" && list.error)) && (
        <p role="alert">{error || list.error}</p>
      )}
    </section>
  );
}
