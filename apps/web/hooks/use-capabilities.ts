"use client";

import { useSyncExternalStore } from "react";

import { isChromium, supportsFileSystemAccess } from "@/lib/audio/persistence";

/** These never change for the life of the page, so there is nothing to subscribe to. */
const noSubscribe = () => () => {};

/** Server assumes the conservative path: no handle persistence (E4.5). */
export function useSupportsFileSystemAccess(): boolean {
  return useSyncExternalStore(noSubscribe, supportsFileSystemAccess, () => false);
}

/** Server assumes Chromium so the "use a Chromium browser" nudge isn't flashed. */
export function useIsChromium(): boolean {
  return useSyncExternalStore(noSubscribe, isChromium, () => true);
}
