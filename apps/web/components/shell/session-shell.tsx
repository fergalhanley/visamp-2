"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AuthProvider } from "@/components/auth/auth-provider";
import { EdgeGlyphs } from "@/components/chrome/edge-glyphs";
import { NowPlaying } from "@/components/chrome/now-playing";
import { Transport } from "@/components/chrome/transport";
import { APanel } from "@/components/panels/a-panel";
import { PanelHotZone } from "@/components/panels/panel";
import { VPanel } from "@/components/panels/v-panel";
import { BootGate } from "@/components/shell/boot-gate";
import { CanvasLayer } from "@/components/shell/canvas-layer";
import { useIdleChrome } from "@/hooks/use-idle-chrome";
import { useIntervalAdvance } from "@/hooks/use-interval-advance";
import { useVisRouteSync } from "@/hooks/use-vis-route-sync";
import { useAudioStore, wireAudioEvents } from "@/lib/store/audio";
import { useChromeStore } from "@/lib/store/chrome";
import { useSessionStore } from "@/lib/store/session";

/**
 * Everything that must outlive route changes (principle 3: the player owns the
 * session, not the page). Mounted once from the root layout.
 */
export function SessionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The editor owns the canvas on its own routes. The WASM module binds to the
  // first #canvas in the document and refuses to re-init, so the player's
  // canvas and the editor preview cannot coexist — which is also why entering
  // and leaving the editor is a full page load rather than a client navigation.
  const editorRoute = pathname.startsWith("/edit");

  useIdleChrome();
  useVisRouteSync();
  useIntervalAdvance();

  const chromeVisible = useChromeStore((s) => s.visible);
  const booted = useSessionStore((s) => s.booted);

  useEffect(() => {
    wireAudioEvents();
    // E4.5 — bring back whatever tracklist the last session left behind.
    void useAudioStore.getState().restore();
  }, []);

  // Hide the pointer once the visualisation is running and the chrome has gone.
  // Applied to body rather than the canvas so it holds over the hot zones too.
  useEffect(() => {
    const hide = booted && !chromeVisible;
    document.body.classList.toggle("visamp-hide-cursor", hide);
    return () => document.body.classList.remove("visamp-hide-cursor");
  }, [booted, chromeVisible]);

  if (editorRoute) {
    return <AuthProvider>{children}</AuthProvider>;
  }

  return (
    <AuthProvider>
      <CanvasLayer />

      {/* Route content: the crawlable HTML behind the canvas (E7.5). */}
      {children}

      <EdgeGlyphs />
      <PanelHotZone side="v" />
      <PanelHotZone side="a" />
      <VPanel />
      <APanel />
      <NowPlaying />
      <Transport />
      <BootGate />
    </AuthProvider>
  );
}
