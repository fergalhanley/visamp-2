"use client";

import { useEffect, useState } from "react";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";

export function PreferredTrack({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const [tracks, setTracks] = useState<HostedTrackSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/tracks", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data.tracks)) throw new Error();
        if (!controller.signal.aborted) {
          setTracks(data.tracks);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
      <label htmlFor="preferred-track" className="text-muted-foreground">
        Preferred track
      </label>
      <select
        id="preferred-track"
        value={value ?? ""}
        disabled={disabled || loading || error}
        onChange={(event) => onChange(event.target.value || null)}
        className="min-w-0 flex-1 rounded-md border bg-background py-1 pl-2 pr-6 disabled:opacity-60"
      >
        <option value="">{loading ? "Loading music…" : "None"}</option>
        {value && !tracks.some((track) => track.id === value) && (
          <option value={value}>
            {loading ? "Loading selected track…" : "Selected track unavailable"}
          </option>
        )}
        {tracks.map((track) => (
          <option key={track.id} value={track.id}>
            {track.title} — {track.artist}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert">
          Music unavailable.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setLoading(true);
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </button>
        </span>
      )}
      {!disabled && value && (
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={() => onChange(null)}
        >
          Clear track
        </button>
      )}
    </div>
  );
}
