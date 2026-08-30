"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/store/session";

/**
 * Remembers what was being liked across the OAuth round trip, which bounces the
 * whole document. Same shape as the fork intent, and stored rather than assumed
 * because the player may have moved on by the time the session lands.
 */
const INTENT_KEY = "visamp.intent.like-vis";

interface LikeWrite {
  /** True when the database ended up in the state that was asked for. */
  ok: boolean;
  /** True only when a row actually appeared or disappeared. */
  counted: boolean;
  error: string | null;
}

/**
 * Adds or removes the row. A plain function rather than a hook callback,
 * following `ForkVisButton`: the sign-in replay has to start this from an
 * effect, and anything touching component state there is the cascading-render
 * trap that `set-state-in-effect` guards against.
 *
 * `counted` is separate from `ok` because the counter must only move when the
 * rows did. Clicking twice in two tabs, or signing in to like something already
 * liked, both end in the right state having changed nothing.
 */
async function writeLike(
  visId: string,
  userId: string,
  liked: boolean,
): Promise<LikeWrite> {
  const supabase = createClient();

  if (liked) {
    const { error } = await supabase
      .from("likes")
      .insert({ user_id: userId, vis_id: visId });

    // 23505 is the primary key: the like is already there, so what was asked
    // for holds — it just was not this call that did it.
    if (error && error.code !== "23505") {
      return { ok: false, counted: false, error: error.message };
    }
    return { ok: true, counted: !error, error: null };
  }

  // Toggling off is a delete rather than a flag, which is what keeps the
  // counter trigger a simple +1/-1.
  const { data, error } = await supabase
    .from("likes")
    .delete()
    .eq("user_id", userId)
    .eq("vis_id", visId)
    .select("vis_id");

  if (error) return { ok: false, counted: false, error: error.message };
  return { ok: true, counted: (data?.length ?? 0) > 0, error: null };
}

export interface VisLike {
  /** True when the signed-in viewer has liked what is playing. */
  liked: boolean;
  /** False for the built-in default and the fixtures: no row to like. */
  likeable: boolean;
  /** Opens the sign-in dialog instead of liking, when signed out. */
  toggle: () => void;
  signInOpen: boolean;
  setSignInOpen: (open: boolean) => void;
}

/**
 * The heart on the transport: whether the viewer has liked what is playing, and
 * the toggle that changes it (E5.5).
 *
 * The count itself lives on the visualisation, maintained by a trigger. This
 * moves it optimistically so the number answers on the click, and puts it back
 * if the write does not land.
 */
export function useVisLike(): VisLike {
  const { user, loading } = useAuth();
  const id = useSessionStore((s) => s.current.id);
  const ownerId = useSessionStore((s) => s.current.ownerId);

  // Keyed by viewer and visualisation, and read back only on a match. Derived
  // that way rather than reset in an effect, so signing out or skipping to the
  // next visualisation clears the heart in the same render — and one viewer's
  // likes can never show up under another's name.
  const [known, setKnown] = useState<{ key: string; liked: boolean } | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  // Guards the gap between the click and the write: a second click in that
  // window would send a duplicate and double-move the optimistic count.
  const busy = useRef(false);

  const likeable = Boolean(ownerId);
  const key = user && likeable ? `${user.id}:${id}` : null;
  const liked = key !== null && known?.key === key && known.liked;

  // What the viewer already thinks of this one. RLS returns only their own
  // rows, so an empty result really does mean "not liked".
  useEffect(() => {
    if (!key || !user) return;

    let active = true;
    void createClient()
      .from("likes")
      .select("vis_id")
      .eq("user_id", user.id)
      .eq("vis_id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setKnown({ key, liked: Boolean(data) });
      });

    return () => {
      active = false;
    };
  }, [key, user, id]);

  // Replay the intent once the session lands. Signing in to like something is
  // unambiguous — it is always a like, never a toggle back off.
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem(INTENT_KEY);
    if (!pending) return;

    sessionStorage.removeItem(INTENT_KEY);
    void writeLike(pending, user.id, true).then((result) => {
      if (!result.ok) {
        console.warn("[visamp] like not saved:", result.error);
        return;
      }
      if (result.counted) useSessionStore.getState().countLike(pending, 1);
      setKnown({ key: `${user.id}:${pending}`, liked: true });
      window.dispatchEvent(new Event("visamp:likes-changed"));
    });
  }, [user]);

  const toggle = useCallback(() => {
    if (loading || busy.current || !likeable || !key) return;

    if (!user) {
      sessionStorage.setItem(INTENT_KEY, id);
      setSignInOpen(true);
      return;
    }

    const next = !liked;
    const delta: 1 | -1 = next ? 1 : -1;
    const undo: 1 | -1 = next ? -1 : 1;

    busy.current = true;
    setKnown({ key, liked: next });
    useSessionStore.getState().countLike(id, delta);

    void writeLike(id, user.id, next).then((result) => {
      busy.current = false;

      if (!result.ok) {
        // Put both halves back. The count is only ever a mirror of the rows, so
        // leaving it ahead of a write that never happened is worse than the
        // number jumping back.
        console.warn("[visamp] like not saved:", result.error);
        setKnown({ key, liked: !next });
        useSessionStore.getState().countLike(id, undo);
        return;
      }

      // Right state, but this call did not put it there — so the optimistic
      // bump was counting a row that was already there (or already gone).
      if (!result.counted) useSessionStore.getState().countLike(id, undo);
      window.dispatchEvent(new Event("visamp:likes-changed"));
    });
  }, [loading, likeable, key, user, id, liked]);

  return { liked, likeable, toggle, signInOpen, setSignInOpen };
}
