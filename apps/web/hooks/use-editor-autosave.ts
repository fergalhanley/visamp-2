"use client";

import { useEffect, useRef, useState } from "react";

export interface EditorSnapshot {
  title: string;
  source: string;
  visibility: "public" | "private";
}

export const AUTOSAVE_MS = 8000;
export const SAVE_TIMEOUT_MS = 20000;

interface Options {
  value: EditorSnapshot;
  /** The current source has compiled successfully and this viewer can edit. */
  enabled: boolean;
  persist: (snapshot: EditorSnapshot, signal: AbortSignal) => Promise<void>;
  onError: (message: string) => void;
}

/** Throttle writes, retaining edits made while the previous snapshot is saving. */
export function useEditorAutosave({
  value,
  enabled,
  persist,
  onError,
}: Options) {
  const [lastSaved, setLastSaved] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(0);
  const lastSaveAt = useRef(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current?.abort();
    };
  }, []);
  const latest = useRef({ value, enabled, persist, onError });
  useEffect(() => {
    latest.current = { value, enabled, persist, onError };
  }, [value, enabled, persist, onError]);

  const dirty =
    value.title !== lastSaved.title ||
    value.source !== lastSaved.source ||
    value.visibility !== lastSaved.visibility;
  const canSave = enabled && dirty && !saving;

  useEffect(() => {
    if (!canSave) return;
    const timer = window.setTimeout(
      async () => {
        if (!latest.current.enabled || pending.current) return;
        const { value: snapshot, persist, onError } = latest.current;
        pending.current = true;
        setSaving(true);
        setSaveError(null);
        const controller = new AbortController();
        active.current = controller;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            persist(snapshot, controller.signal),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => {
                reject(
                  new Error(
                    "Saving timed out. Your changes will be retried automatically.",
                  ),
                );
                controller.abort();
              }, SAVE_TIMEOUT_MS);
            }),
          ]);
          if (mounted.current) setLastSaved(snapshot);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not save changes.";
          if (mounted.current) {
            setSaveError(message);
            onError(message);
          }
        } finally {
          clearTimeout(timeout);
          lastSaveAt.current = Date.now();
          pending.current = false;
          active.current = null;
          // Completion must trigger scheduling even when dirty/compile stay true,
          // or when a fast failure batches saving=true/false into one render.
          if (mounted.current) {
            setSaving(false);
            setCompleted((count) => count + 1);
          }
        }
      },
      Math.max(0, AUTOSAVE_MS - (Date.now() - lastSaveAt.current)),
    );
    return () => window.clearTimeout(timer);
  }, [canSave, completed]);

  return { dirty, saving, saveError, setSaveError };
}
