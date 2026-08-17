"use client";

import { GitFork, ListPlus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { AddToPlaylistDialog } from "@/components/panels/add-to-playlist-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { useChromeStore } from "@/lib/store/chrome";
import type { Visualisation } from "@/lib/types";

interface VisMenuProps {
  vis: Visualisation;
  /** Hint from the caller — the My Visualisations tab knows without a lookup. */
  owned?: boolean;
  /** Called after an action changes the underlying data. */
  onChanged: () => void;
}

export function VisMenu({ vis, owned = false, onChanged }: VisMenuProps) {
  const { user } = useAuth();
  const setPinned = useChromeStore((s) => s.setPinned);

  // Derived as well as passed, so owner-only entries appear wherever the row
  // turns up — including your own work listed under the public tab — and don't
  // silently vanish if a caller forgets the hint.
  const isOwner = owned || Boolean(user && vis.ownerId && vis.ownerId === user.id);

  const [menuOpen, setMenuOpen] = useState(false);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The popups portal outside the panel, so moving the pointer onto one counts
   * as leaving the panel and would close it. Pin while anything is open.
   */
  const pin = (open: boolean) => setPinned("v", open);

  const requireAuth = (): boolean => {
    if (user) return true;
    setSignInOpen(true);
    pin(true);
    return false;
  };

  const edit = () => {
    // Hard navigation on purpose. The WASM module binds to the first #canvas in
    // the document and refuses to re-init, so the editor preview can only claim
    // it in a fresh document — a client-side push would leave a dead preview.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/edit/${vis.id}`;
  };

  const fork = async () => {
    if (!requireAuth()) return;

    setBusy(true);
    setError(null);

    // E6.11 — a fork is an insert, never an update, and counters do not carry
    // over. `forked_from_id` is insert-only at the grant level, so attribution
    // cannot be stripped afterwards.
    const { data, error: forkError } = await createClient()
      .from("visualisations")
      .insert({
        owner_id: user!.id,
        title: `${vis.title} (fork)`,
        description: vis.description ?? null,
        source: vis.source,
        visibility: "private",
        forked_from_id: vis.ownerId ? vis.id : null,
      })
      .select("id")
      .single();

    setBusy(false);

    if (forkError || !data) {
      setError(forkError?.message ?? "Could not fork");
      return;
    }

    // Same reason as `edit` above.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/edit/${data.id}`;
  };

  const remove = async () => {
    setBusy(true);
    setError(null);

    const supabase = createClient();

    // Row first: if this fails nothing is lost, whereas removing the thumbnail
    // first and then failing would leave a visualisation with a broken image.
    const { error: deleteError } = await supabase
      .from("visualisations")
      .delete()
      .eq("id", vis.id);

    if (deleteError) {
      setError(deleteError.message);
      setBusy(false);
      return;
    }

    // Best effort — an orphaned file is harmless, a failed delete is not.
    if (vis.ownerId) {
      await supabase.storage.from("thumbnails").remove([`${vis.ownerId}/${vis.id}.png`]);
    }

    setBusy(false);
    setConfirmOpen(false);
    pin(false);
    onChanged();
  };

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          setMenuOpen(open);
          pin(open);
        }}
      >
        <DropdownMenuTrigger
          aria-label={`Actions for ${vis.title}`}
          onClick={(event) => event.stopPropagation()}
          className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-foreground/10 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[popup-open]:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-44">
          {isOwner && (
            <DropdownMenuItem onClick={edit}>
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
          )}

          <DropdownMenuItem disabled={busy} onClick={() => void fork()}>
            <GitFork className="h-3.5 w-3.5" />
            Fork
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => {
              if (!requireAuth()) return;
              setPlaylistOpen(true);
              pin(true);
            }}
          >
            <ListPlus className="h-3.5 w-3.5" />
            Add to playlist
          </DropdownMenuItem>

          {isOwner && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setConfirmOpen(true);
                  pin(true);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          pin(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{vis.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the visualisation and its thumbnail. Forks
              other people have made are unaffected and keep their attribution.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                // Keep the dialog up until the delete resolves.
                event.preventDefault();
                void remove();
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddToPlaylistDialog
        vis={vis}
        open={playlistOpen}
        onOpenChange={(open) => {
          setPlaylistOpen(open);
          pin(open);
        }}
      />

      <SignInDialog
        open={signInOpen}
        onOpenChange={(open) => {
          setSignInOpen(open);
          pin(open);
        }}
      />
    </>
  );
}
