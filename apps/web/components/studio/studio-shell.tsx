"use client";

import { useEffect, useRef, useState } from "react";
import { request } from "@/lib/sets/client";
import { duration, timecode, type SetDocument } from "@/lib/sets/model";
import type { StudioSelection, StudioSets } from "@/lib/studio/model";

export function StudioShell() {
  const [data, setData] = useState<StudioSets | null>(null);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState<string | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    let active = true;
    void request<StudioSets>("/api/studio/sets")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load your Sets.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  async function selectSet(setId: string) {
    if (pending.current) return;
    pending.current = true;
    setSelecting(setId);
    setError("");
    try {
      const { selection } = await request<{ selection: StudioSelection }>(
        "/api/studio/sets",
        "POST",
        { setId },
      );
      setData((current) =>
        current
          ? {
              ...current,
              selections: [
                selection,
                ...current.selections.filter(
                  (item) => item.setId !== selection.setId,
                ),
              ],
            }
          : current,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not select this Set.",
      );
    } finally {
      pending.current = false;
      setSelecting(null);
    }
  }

  const selected = new Map(data?.selections.map((item) => [item.setId, item]));
  const selectedSets = data?.sets.filter((set) => selected.has(set.id)) ?? [];
  const availableSets = data?.sets.filter((set) => !selected.has(set.id)) ?? [];

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="site-eyebrow">STUDIO</p>
          <h1>Take your Sets further.</h1>
          <p className="max-w-2xl text-muted-foreground">
            Choose the Sets you want to distribute. Create, edit and preview
            your music and visuals in Set Builder.
          </p>
        </div>
        <a href="/sets/new" className="site-button">
          Create a Set
        </a>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Loading your Sets…</p>}
      {data && (
        <>
          <section aria-labelledby="studio-selected-heading" className="mb-10">
            <h2 id="studio-selected-heading">Selected for distribution</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Selection saves a Set here. Music rights and visual licences must
              be checked before export.
            </p>
            {selectedSets.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {selectedSets.map((set) => (
                  <SetCard key={set.id} set={set}>
                    <p className="text-xs text-muted-foreground">
                      Selected{" "}
                      {new Date(
                        selected.get(set.id)!.selectedAt,
                      ).toLocaleDateString()}
                    </p>
                    <span className="rounded-full border px-2 py-1 text-xs">
                      Awaiting export
                    </span>
                  </SetCard>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                No Sets selected yet. Choose one from your library below.
              </p>
            )}
          </section>
          <section aria-labelledby="studio-library-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="studio-library-heading">Your Set library</h2>
              <a href="/sets" className="text-sm underline underline-offset-4">
                Open Set Builder
              </a>
            </div>
            {availableSets.length ? (
              <div className="grid gap-3 md:grid-cols-2">
                {availableSets.map((set) => (
                  <SetCard key={set.id} set={set}>
                    <button
                      type="button"
                      className="site-button"
                      disabled={selecting !== null}
                      onClick={() => void selectSet(set.id)}
                    >
                      {selecting === set.id
                        ? "Selecting…"
                        : "Select for distribution"}
                    </button>
                  </SetCard>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
                {data.sets.length
                  ? "All your Sets are selected. You can create another in Set Builder."
                  : "Create your first Set in Set Builder, then select it here for distribution."}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SetCard({
  set,
  children,
}: {
  set: SetDocument;
  children: React.ReactNode;
}) {
  return (
    <article aria-label={set.name} className="rounded-xl border p-4">
      <h3 className="truncate font-medium">{set.name}</h3>
      {set.description && (
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {set.description}
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {timecode(duration(set))} · {set.audioClips.length} audio ·{" "}
        {set.visualClips.length} visual clips
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Edited {new Date(set.updatedAt).toLocaleString()}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <a
          href={`/sets/${set.id}/edit`}
          className="text-sm underline underline-offset-4"
        >
          Edit / preview in Set Builder
        </a>
        {children}
      </div>
    </article>
  );
}
