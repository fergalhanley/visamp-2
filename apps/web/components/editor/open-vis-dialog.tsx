"use client";

import { Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMyVisualisations } from "@/hooks/use-my-visualisations";
import { relativeDate } from "@/lib/time";
import { cn } from "@/lib/utils";

interface OpenVisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Marked in the list so it is obvious which one is already open. */
  currentId?: string;
}

export function OpenVisDialog({ open, onOpenChange, currentId }: OpenVisDialogProps) {
  const { items, loading, error } = useMyVisualisations();
  const [filter, setFilter] = useState("");

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const all = items ?? [];
    if (!needle) return all;
    return all.filter((vis) => vis.title.toLowerCase().includes(needle));
  }, [items, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Open a visualisation</DialogTitle>
          <DialogDescription>Your work, most recently edited first.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by title"
            aria-label="Filter by title"
            autoFocus
            className={cn(
              "w-full rounded-md border bg-transparent py-1.5 pl-8 pr-2 text-sm",
              "outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring",
            )}
          />
        </div>

        <div className="max-h-80 min-h-24 overflow-y-auto">
          {loading ? (
            <p className="flex items-center gap-2 px-1 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </p>
          ) : error ? (
            <p className="px-1 py-3 text-sm text-destructive">{error}</p>
          ) : matches.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">
              {items?.length ? "Nothing matches that." : "You have not made anything yet."}
            </p>
          ) : (
            <ul>
              {matches.map((vis) => (
                <li key={vis.id}>
                  {/* A full page load, not a client navigation: the editor's
                      preview has to claim the engine on a fresh document. */}
                  <a
                    href={`/edit/${vis.id}`}
                    className={cn(
                      "flex items-baseline gap-3 rounded-md px-2 py-2 transition",
                      vis.id === currentId
                        ? "bg-foreground/10"
                        : "cursor-pointer hover:bg-foreground/5",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {vis.title}
                      {vis.id === currentId && (
                        <span className="ml-2 text-xs text-muted-foreground">open</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {vis.visibility === "public" ? "Public" : "Private"}
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                      {relativeDate(vis.updatedAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
