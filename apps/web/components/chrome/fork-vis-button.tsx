"use client";

import { GitFork, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

/**
 * Remembers which visualisation was being forked across the OAuth round trip,
 * which bounces the whole document. The id is stored rather than assumed,
 * because the player may well have moved on by the time the session lands.
 */
const INTENT_KEY = "visamp.intent.fork-vis";

/**
 * Forks a visualisation and navigates to the copy.
 *
 * Deliberately a plain function rather than a hook callback: the sign-in replay
 * has to start this from an effect, and anything touching component state there
 * is the cascading-render trap that `set-state-in-effect` guards against.
 * Returning the failure instead lets each caller decide where to put it.
 */
async function insertFork(visId: string, ownerId: string): Promise<string | null> {
  const supabase = createClient();

  // Read fresh rather than trusting what is on screen: after a sign-in round
  // trip the remembered id may no longer be what is playing.
  const { data: row, error: readError } = await supabase
    .from("visualisations")
    .select("title, description, source")
    .eq("id", visId)
    .maybeSingle();

  if (readError) return readError.message;

  // A fixture has no row to fork from, so fall back to what is on screen and
  // leave the attribution empty rather than pointing at an id that is not there.
  const playing = useSessionStore.getState().current;
  const title = row?.title ?? playing.title;
  const source = row?.source ?? playing.source;

  // E6.11 — a fork is an insert, never an update, and counters do not carry
  // over. `forked_from_id` is insert-only at the grant level, so attribution
  // cannot be stripped afterwards.
  const { data, error } = await supabase
    .from("visualisations")
    .insert({
      owner_id: ownerId,
      title: `${title} (fork)`,
      description: row?.description ?? null,
      source,
      visibility: "private",
      forked_from_id: row ? visId : null,
    })
    .select("id")
    .single();

  if (error || !data) return error?.message ?? "Could not fork";

  // Hard navigation: the editor needs a fresh document to claim the engine.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = `/edit/${data.id}`;
  return null;
}

export function ForkVisButton({ className }: { className?: string }) {
  const { user, loading } = useAuth();
  const current = useSessionStore((s) => s.current);
  const [signInOpen, setSignInOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Replay the intent once the session lands.
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem(INTENT_KEY);
    if (!pending) return;

    sessionStorage.removeItem(INTENT_KEY);
    void insertFork(pending, user.id).then(setError);
  }, [user]);

  const onClick = () => {
    if (loading || busy) return;

    if (!user) {
      sessionStorage.setItem(INTENT_KEY, current.id);
      setSignInOpen(true);
      return;
    }

    setBusy(true);
    void insertFork(current.id, user.id).then((message) => {
      // Left busy on success: the navigation is already on its way, and
      // flicking back to the idle icon first would just look like a misfire.
      if (message === null) return;
      setBusy(false);
      setError(message);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={error ?? `Fork ${current.title} into a copy you own`}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium",
          "bg-sky-500 text-black",
          "transition hover:bg-sky-400 disabled:opacity-70",
          "focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none",
          className,
        )}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitFork className="h-4 w-4" />
        )}
        Fork Vis
      </button>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} next="/" />
    </>
  );
}
