"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/store/session";
import { profileAvatarUrl } from "@/lib/storage-urls";
import { creatorName } from "@/lib/visualisations";

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorUsername: string | null;
  authorAvatarUrl: string | null;
}

// Named FK rather than a bare embed: `likes` already taught us that a later
// table can add a second path between two tables and break every plain
// `profiles(...)` in the codebase at once.
const SELECT = `
  id, body, created_at, author_id,
  profiles!comments_author_id_fkey(username, avatar_url, avatar_path)
`;

interface Row {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  profiles: {
    username: string | null;
    avatar_url: string | null;
    avatar_path: string | null;
  } | null;
}

function toComment(row: Row): Comment {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: creatorName(row.profiles),
    authorUsername: row.profiles?.username ?? null,
    authorAvatarUrl: profileAvatarUrl(row.profiles) ?? null,
  };
}

export interface CommentsThread {
  comments: Comment[] | null;
  error: string | null;
  /** Adds a comment. Returns an error message, or null on success. */
  post: (userId: string, body: string) => Promise<string | null>;
  /** Soft delete (E5.9). Returns an error message, or null on success. */
  remove: (commentId: string) => Promise<string | null>;
}

/**
 * One visualisation's thread (E5.7, E5.8): flat, newest first, anonymous to
 * read and authenticated to write.
 *
 * Only loads while `active`, so having the dialog in the tree costs nothing
 * until someone opens it.
 */
export function useComments(visId: string, active: boolean): CommentsThread {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient()
      .from("comments")
      .select(SELECT)
      .eq("vis_id", visId)
      .order("created_at", { ascending: false })
      .limit(200);

    return {
      items: ((data ?? []) as Row[]).map(toComment),
      error: loadError?.message ?? null,
    };
  }, [visId]);

  useEffect(() => {
    if (!active) return;

    let live = true;
    void load().then(({ items, error: loadError }) => {
      if (!live) return;
      setComments(items);
      setError(loadError);
    });

    return () => {
      live = false;
    };
  }, [active, load]);

  const post = useCallback(
    async (userId: string, body: string): Promise<string | null> => {
      const trimmed = body.trim();
      if (!trimmed) return null;

      const { data, error: postError } = await createClient()
        .from("comments")
        .insert({ vis_id: visId, author_id: userId, body: trimmed })
        .select(SELECT)
        .single();

      if (postError || !data) {
        return postError?.message ?? "Could not post that";
      }

      // Prepended rather than refetched: the thread is newest first, and a
      // round trip here would make a comment appear a beat after it was sent.
      setComments((current) => [toComment(data as Row), ...(current ?? [])]);
      useSessionStore.getState().countComment(visId, 1);
      return null;
    },
    [visId],
  );

  const remove = useCallback(
    async (commentId: string): Promise<string | null> => {
      const { error: deleteError } = await createClient()
        .from("comments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", commentId);

      if (deleteError) return deleteError.message;

      setComments((current) =>
        (current ?? []).filter((comment) => comment.id !== commentId),
      );
      useSessionStore.getState().countComment(visId, -1);
      return null;
    },
    [visId],
  );

  return { comments, error, post, remove };
}
