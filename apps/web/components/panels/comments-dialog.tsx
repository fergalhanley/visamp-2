"use client";

import { CommentsThread } from "@/components/panels/comments-thread";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Visualisation } from "@/lib/types";

interface CommentsDialogProps {
  vis: Visualisation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The comments thread as a popup, for the player's transport.
 *
 * Only the shell lives here — the thread itself is shared with the artist
 * gallery, where it sits directly in the page.
 */
export function CommentsDialog({ vis, open, onOpenChange }: CommentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {vis.commentCount === 1 ? "1 Comment" : `${vis.commentCount} Comments`}
          </DialogTitle>
          <DialogDescription className="truncate">{vis.title}</DialogDescription>
        </DialogHeader>

        <CommentsThread vis={vis} active={open} listClassName="max-h-72" />
      </DialogContent>
    </Dialog>
  );
}
