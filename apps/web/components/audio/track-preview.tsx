"use client";
import { useState } from "react";
import type { HostedPlayback } from "@/lib/hosted-audio/types";

/** Fetch a fresh signed URL only when the listener chooses to play. */
export function TrackPreview({ trackId }: { trackId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function play() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/tracks/${trackId}/playback`, {
        cache: "no-store",
      });
      const data = (await response.json()) as HostedPlayback & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "This track is unavailable.");
      const source =
        data.sources.find(
          (item) => item.format === "mp3" || item.format === "aac",
        ) ?? data.sources[0];
      if (!source) throw new Error("This track is unavailable.");
      setUrl(source.url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not play this track.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      {url ? (
        <audio
          src={url}
          controls
          autoPlay
          aria-label="Track preview"
          className="w-full max-w-xs"
          onError={() => {
            setUrl(null);
            setError("Playback failed. Press Play to try again.");
          }}
        />
      ) : (
        <button type="button" onClick={() => void play()} disabled={pending}>
          {pending ? "Loading…" : "Play"}
        </button>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
