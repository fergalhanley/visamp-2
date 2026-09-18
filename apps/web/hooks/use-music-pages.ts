"use client";
import { track } from "@/lib/analytics/client";
import { useCallback, useEffect, useRef, useState } from "react";

/** Requests are tied to their filter key; stale pages never replace new results. */
export function useMusicPages<T extends { id: string }>(
  url: string | null,
  field: string,
  version = 0,
) {
  const [state, setState] = useState<{
    key: string;
    items: T[];
    next: number | null;
    loading: boolean;
    error: string | null;
  }>({ key: "", items: [], next: null, loading: false, error: null });
  const key = `${url}|${version}`;
  const generation = useRef(0);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const fetchPage = useCallback(
    async (offset: number, replace: boolean, token: number) => {
      if (!url || busy.current) return;
      busy.current = true;
      const controller = new AbortController();
      abort.current = controller;
      setState((s) =>
        replace
          ? { key, items: [], next: 0, loading: true, error: null }
          : { ...s, loading: true, error: null },
      );
      try {
        const response = await fetch(
          `${url}${url.includes("?") ? "&" : "?"}offset=${offset}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "Could not load music.");
        if (token !== generation.current) return;
        if (replace && new URL(url, location.origin).searchParams.get("q")) track("search_performed", { content_type: field, result_count: data[field].length, source_panel: "audio" });
        setState((s) => {
          const items = replace ? data[field] : [...s.items, ...data[field]];
          return {
            key,
            items: [
              ...new Map(items.map((item: T) => [item.id, item])).values(),
            ] as T[],
            next: data.nextOffset,
            loading: false,
            error: null,
          };
        });
      } catch (error) {
        if (token !== generation.current || controller.signal.aborted) return;
        setState((s) => ({
          ...s,
          loading: false,
          error:
            error instanceof Error ? error.message : "Could not load music.",
        }));
      } finally {
        if (token === generation.current) busy.current = false;
      }
    },
    [url, key, field],
  );
  useEffect(() => {
    const token = ++generation.current;
    busy.current = false;
    void fetchPage(0, true, token);
    return () => {
      generation.current = token + 1;
      abort.current?.abort();
    };
  }, [fetchPage]);
  const current =
    state.key === key
      ? state
      : { items: [], next: 0, loading: !!url, error: null };
  const more = useCallback(() => {
    if (state.key === key && state.next !== null)
      void fetchPage(state.next, state.items.length === 0, generation.current);
  }, [state.key, state.next, state.items.length, key, fetchPage]);
  const updateItems = useCallback(
    (update: (items: T[]) => T[]) => {
      setState((s) => {
        if (s.key !== key) return s;
        const items = update(s.items);
        return {
          ...s,
          items,
          next:
            s.next === null
              ? null
              : Math.max(0, s.next + items.length - s.items.length),
        };
      });
    },
    [key],
  );
  return { ...current, more, updateItems };
}
