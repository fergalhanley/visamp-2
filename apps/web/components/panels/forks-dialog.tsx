"use client";

import { GitFork } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useForks } from "@/hooks/use-forks";
import { useSessionStore } from "@/lib/store/session";
import { relativeDate } from "@/lib/time";
import type { Visualisation } from "@/lib/types";

interface ForksDialogProps {
  vis: Visualisation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * What has been made from this visualisation (E6.11). Picking one plays it,
 * the same as picking a tile in the V panel.
 */
export function ForksDialog({ vis, open, onOpenChange }: ForksDialogProps) {
  const { items, error } = useForks(vis.id, open);
  const select = useSessionStore((s) => s.select);

  // fork_count counts every fork ever made; the list is only what this viewer
  // is allowed to see. Saying so beats looking broken.
  const hidden = items ? Math.max(vis.forkCount - items.length, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {vis.forkCount === 1 ? "1 Fork" : `${vis.forkCount} Forks`}
          </DialogTitle>
          <DialogDescription className="truncate">
            Made from {vis.title}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : items === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing has been forked from this yet.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {items.map((fork) => (
              <li key={fork.id}>
                <button
                  type="button"
                  onClick={() => {
                    // Deliberately not re-setting the playing context: next and
                    // prev should still walk the list the viewer was browsing.
                    select(fork);
                    onOpenChange(false);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-foreground/5"
                >
                  <GitFork className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{fork.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {fork.creator.username} · {relativeDate(fork.updatedAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {hidden > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {hidden === 1 ? "1 fork is private." : `${hidden} forks are private.`}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
