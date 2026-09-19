"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import {
  createStarterPrompt,
  STARTER_PROMPT_HASH,
} from "@/lib/editor/starter-prompts";
import { EditorShell } from "./editor-shell";

type Document = {
  visualisation: Database["public"]["Tables"]["visualisations"]["Row"] | null;
  canEdit: boolean;
  initialPrompt?: string;
};

/** Never seed an editable buffer from a cached server-component payload. */
export function EditorDocument({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<{
    id: string;
    document: Document;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    // BFCache can restore the entire JS heap without mounting this component.
    // A fresh document also gives the singleton WASM renderer a fresh host.
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch(`/api/editor/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) {
          let initialPrompt = "";
          if (window.location.hash === STARTER_PROMPT_HASH) {
            // Consume only after a successful read: failures can still retry.
            // Let Next synchronize its router state with the cleaned URL.
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
            if (result.canEdit && result.visualisation?.title) {
              initialPrompt = createStarterPrompt(result.visualisation.title);
            }
          }
          setLoaded({ id, document: { ...result, initialPrompt } });
        }
      })
      .catch((cause) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load visualisation.",
          );
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, attempt]);
  if (loaded?.id === id) return <EditorShell key={id} {...loaded.document} />;
  return (
    <main className="site-page flex min-h-screen items-center justify-center p-6">
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button
            className="site-button secondary mt-4"
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <p role="status">Loading latest saved visualisation…</p>
      )}
    </main>
  );
}
