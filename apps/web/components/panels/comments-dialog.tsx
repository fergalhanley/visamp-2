"use client";

import { Loader2, Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { CommentBody } from "@/components/panels/comment-body";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useComments } from "@/hooks/use-comments";
import { relativeDate } from "@/lib/time";
import type { Visualisation } from "@/lib/types";

/**
 * A draft kept across the OAuth round trip, which bounces the whole document
 * (E5.4). Unlike the like and fork intents this does *not* replay itself: a
 * comment is the viewer's own words, and posting them without their finger on
 * the button is not a thing to do on their behalf. Sign-in returns to this
 * visualisation, the draft comes back in the box, and they press Post.
 */
const DRAFT_KEY = "visamp.intent.comment-draft";

interface Draft {
  visId: string;
  body: string;
}

/**
 * Takes the draft if it belongs to this visualisation, leaving it behind
 * otherwise — the player may have moved on, and someone else's thread is not
 * the place for those words.
 *
 * Read from a lazy state initialiser rather than an effect, so the draft is
 * simply the box's opening value; restoring it afterwards would be a state
 * sync in an effect, which is the cascading-render trap.
 */
function consumeDraft(visId: string): string {
  if (typeof window === "undefined") return "";

  const raw = sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return "";

  try {
    const parsed: unknown = JSON.parse(raw);
    const draft = parsed as Draft;
    if (
      typeof draft?.visId !== "string" ||
      typeof draft?.body !== "string" ||
      draft.visId !== visId
    ) {
      return "";
    }

    sessionStorage.removeItem(DRAFT_KEY);
    return draft.body;
  } catch {
    // A draft that will not parse is a draft not worth rescuing.
    sessionStorage.removeItem(DRAFT_KEY);
    return "";
  }
}

interface CommentsDialogProps {
  vis: Visualisation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One visualisation's comments (E5.7): flat, newest first. Anyone can read;
 * writing gates on click and opens sign-in.
 */
export function CommentsDialog({ vis, open, onOpenChange }: CommentsDialogProps) {
  const { user } = useAuth();
  const { comments, error, post, remove } = useComments(vis.id, open);

  // Mounted per visualisation (the parent keys on its id), so this runs with
  // the right thread and a draft never lands under the wrong one.
  const [body, setBody] = useState(() => consumeDraft(vis.id));
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);

  const submit = () => {
    if (busy || !body.trim()) return;

    if (!user) {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ visId: vis.id, body } satisfies Draft),
      );
      setSignInOpen(true);
      return;
    }

    setBusy(true);
    setWriteError(null);
    void post(user.id, body).then((message) => {
      setBusy(false);
      if (message) setWriteError(message);
      else setBody("");
    });
  };

  const owned = Boolean(user && vis.ownerId === user.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {vis.commentCount === 1 ? "1 Comment" : `${vis.commentCount} Comments`}
            </DialogTitle>
            <DialogDescription className="truncate">{vis.title}</DialogDescription>
          </DialogHeader>

          {comments === null ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing yet. Say the first thing.
            </p>
          ) : (
            <ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    {comment.authorAvatarUrl && (
                      <AvatarImage src={comment.authorAvatarUrl} alt="" />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
                      <span className="truncate font-medium text-foreground">
                        {comment.authorName}
                      </span>
                      {relativeDate(comment.createdAt)}
                    </p>
                    <CommentBody body={comment.body} />
                  </div>

                  {/* E5.9 — your own words, or anything said about your work. */}
                  {(owned || comment.authorId === user?.id) && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => void remove(comment.id).then(setWriteError)}
                      className="h-fit shrink-0 cursor-pointer p-1 text-muted-foreground transition hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            className="flex items-end gap-2 border-t pt-3"
          >
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter breaks the line — a comment box is
                // not a document editor.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder={user ? "Add a comment" : "Sign in to comment"}
              aria-label="Add a comment"
              className="min-h-9 flex-1 resize-none rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-foreground/30"
            />
            <Button type="submit" size="sm" disabled={busy || !body.trim()}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Post
            </Button>
          </form>

          {(writeError ?? error) && (
            <p className="text-xs text-destructive">{writeError ?? error}</p>
          )}
        </DialogContent>
      </Dialog>

      <SignInDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        next={`/vis/${vis.id}`}
      />
    </>
  );
}
