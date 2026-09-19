"use client";

import { Check, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMusicPages } from "@/hooks/use-music-pages";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";

export function PreferredTrack({ value, onChange, disabled }: {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<HostedTrackSummary | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  useEffect(() => {
    if (!value || selected?.id === value) return;
    const controller = new AbortController();
    void fetch(`/api/tracks?id=${encodeURIComponent(value)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!controller.signal.aborted) setSelected(data.tracks[0] ?? null);
      })
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setResolved(value); });
    return () => controller.abort();
  }, [value, selected?.id]);
  const label = !value ? "Choose a track" : selected?.id === value
    ? `${selected.title} — ${selected.artist}`
    : resolved === value ? "Selected track unavailable" : "Loading selected track…";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2 text-xs">
      <span id="preferred-track-label" className="text-muted-foreground">Preferred track</span>
      <Dialog open={open && !disabled} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />} disabled={disabled}
          aria-labelledby="preferred-track-label preferred-track-value" className="min-w-0 flex-1 justify-start">
          <Search aria-hidden="true" />
          <span id="preferred-track-value" className="truncate">{label}</span>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Choose a preferred track</DialogTitle>
            <DialogDescription>Used when the listener hasn’t chosen their own music.</DialogDescription>
          </DialogHeader>
          {open && !disabled && <TrackSearch value={value} onSelect={(track) => {
            setSelected(track);
            onChange(track.id);
            setOpen(false);
          }} />}
        </DialogContent>
      </Dialog>
      {!disabled && value && <Button type="button" variant="link" size="xs" onClick={() => onChange(null)}>Clear track</Button>}
    </div>
  );
}

function TrackSearch({ value, onSelect }: { value: string | null; onSelect: (track: HostedTrackSummary) => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const tracks = useMusicPages<HostedTrackSummary>(`/api/music/tracks?q=${encodeURIComponent(search)}`, "tracks");
  const pending = query.trim() !== search;
  return <>
    <Input aria-label="Search tracks" placeholder="Search tracks, artists or albums…" type="search" maxLength={200} value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="max-h-[50dvh] min-h-40 overflow-y-auto" aria-busy={tracks.loading || pending}>
      {pending ? <p role="status" className="p-4 text-muted-foreground">Searching…</p> : <>
        <ul aria-label="Tracks" className="space-y-1">
          {tracks.items.map((track) => <li key={track.id}>
            <Button type="button" variant="ghost" className="h-auto w-full justify-start gap-3 px-3 py-3 text-left" aria-pressed={track.id === value} onClick={() => onSelect(track)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{track.title}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{track.artist}{track.album ? ` · ${track.album}` : ""}</span>
              </span>
              {track.id === value && <Check aria-label="Selected" />}
            </Button>
          </li>)}
        </ul>
        {tracks.loading && <p role="status" className="p-4 text-muted-foreground">Loading tracks…</p>}
        {tracks.error ? <div role="alert" className="p-4 text-muted-foreground">Could not load tracks. <Button variant="link" size="sm" onClick={tracks.more}>Retry</Button></div>
          : !tracks.loading && tracks.items.length === 0 && <p role="status" className="p-4 text-muted-foreground">{search ? "No matching tracks. Try another search." : "No tracks available yet."}</p>}
        {!tracks.error && tracks.next !== null && !tracks.loading && <Button variant="outline" className="mt-3 w-full" onClick={tracks.more}>Load more</Button>}
      </>}
    </div>
  </>;
}
