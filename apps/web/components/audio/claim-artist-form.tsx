"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface UploadArtist { id: string; name: string; slug: string }

export function ClaimArtistForm({ onClaimed, onCancel }: {
  onClaimed: (artist: UploadArtist) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ name: string; slug: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/uploads/artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (response.status === 409 && result.code === "artist_name_claimed" && result.artist) {
        setConflict(result.artist);
        return;
      }
      if (!response.ok) throw new Error(result.error);
      onClaimed(result.artist);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create your artist.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="site-form">
        <h2>{onCancel ? "Add another artist" : "What do you release under?"}</h2>
        <p>
          Your artist name is what listeners see beside your tracks. You can add
          multiple artists and choose which one you upload as. Names are unique,
          regardless of capitalisation.
        </p>
        <label>
          Artist name
          <input ref={inputRef} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required disabled={pending} placeholder="e.g. Deep Fixation" autoComplete="off" />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button className="site-button primary" type="submit" disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create artist profile"}
          </button>
          {onCancel && <button className="site-button secondary" type="button" disabled={pending} onClick={onCancel}>Cancel</button>}
        </div>
      </form>
      <AlertDialog open={conflict !== null} onOpenChange={(open) => { if (!open) setConflict(null); }}>
        <AlertDialogContent className="w-[calc(100vw-2rem)]" finalFocus={inputRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>Artist name already claimed</AlertDialogTitle>
            <AlertDialogDescription className="break-words [overflow-wrap:anywhere]">
              Another user has claimed the artist name “{conflict?.name}”. Visit
              the artist page to view the claim and find out how to dispute it,
              or choose a different name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-wrap">
            <AlertDialogCancel>Choose another name</AlertDialogCancel>
            {conflict && <Link className="site-button secondary" href={`/artists/${encodeURIComponent(conflict.slug)}`} target="_blank" rel="noopener noreferrer">View artist</Link>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
