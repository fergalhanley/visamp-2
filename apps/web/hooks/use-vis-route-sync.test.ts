import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSessionStore } from "@/lib/store/session";
import { useVisRouteSync } from "./use-vis-route-sync";
import type { Visualisation } from "@/lib/types";
vi.mock("@/lib/visript/default.viscript", () => ({ default: "" }));
const first: Visualisation = { id: "first-id", slug: "prism-velvet-otter", title: "First", creator: { username: "nova", visCount: 1, totalViews: 1 }, source: "", usesAudio: false, likeCount: 0, commentCount: 0, forkCount: 0, viewCount: 0 };
const second = { ...first, id: "second-id", slug: "wave-golden-fox", title: "Second" };
afterEach(cleanup);
beforeEach(() => {
  window.history.replaceState(null, "", `/vis/${first.slug}`);
  useSessionStore.getState().select(first);
});
it("pushes canonical slugs and restores real works on browser back without repushing", () => {
  renderHook(() => useVisRouteSync());
  act(() => useSessionStore.getState().select(second));
  expect(window.location.pathname).toBe(`/vis/${second.slug}`);
  const historyLength = window.history.length;
  act(() => {
    window.history.replaceState(null, "", `/vis/${first.slug}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(useSessionStore.getState().current.id).toBe(first.id);
  expect(window.history.length).toBe(historyLength);
});
it("does not duplicate the cold page's canonical URL when its row hydrates", () => {
  useSessionStore.getState().select(second);
  renderHook(() => useVisRouteSync());
  const historyLength = window.history.length;
  act(() => useSessionStore.getState().select(first));
  expect(window.history.length).toBe(historyLength);
});
