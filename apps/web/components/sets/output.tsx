"use client";
import { useEffect, useRef, useState } from "react";
import { VisampCanvas, type VisampCanvasHandle } from "@visamp/player";
import { useVisualisationAssets } from "@/hooks/use-visualisation-assets";
import { useAuth } from "@/components/auth/auth-provider";
import { PlaybackClock } from "@/lib/sets/clock";
import { SetAudio } from "@/lib/sets/audio";
import { SetTransport, type TransportState } from "@/lib/sets/transport";
import {
  SessionChannel,
  parseInput,
  parseState,
  parseCommand,
  type Command,
} from "@/lib/sets/protocol";
import { runtimeInput } from "@/lib/sets/input";
import { visualFallback, type Scheduled } from "@/lib/sets/scheduler";
import { type Clip, type MediaRef } from "@/lib/sets/model";
import { useOutputPointer } from "./use-output-pointer";
const black = "";
export function SetOutput({
  sessionId,
  outputId,
}: {
  sessionId: string;
  outputId: string;
}) {
  const { user, loading } = useAuth();
  const { surface, hidden } = useOutputPointer();
  const userId = user?.id;
  const [view, setView] = useState({ source: black, key: "black", opacity: 0 });
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const enableAudio = useRef<() => void>(() => {});
  const handle = useRef<VisampCanvasHandle>(null),
    channel = useRef<SessionChannel | null>(null),
    badVisual = useRef("");
  const { assets, preparation } = useVisualisationAssets(view.source, view.key);
  useEffect(() => {
    if (loading || !userId) return;
    const connection = `${outputId}:${crypto.randomUUID()}`;
    let audio: SetAudio | null = null;
    let superseded = false;
    let closed = false,
      authorised = false,
      lastHeartbeat = performance.now(),
      lastReport = 0,
      controlSequence = 0;
    let lastReportedPlaying = false;
    const clock = new PlaybackClock(
      () => performance.now(),
      () =>
        audio?.context.state === "running"
          ? audio.context.currentTime * 1000
          : null,
    );
    const transport = new SetTransport(clock.now);
    let sources: Record<string, string> = {};
    let previousAudio: Scheduled[] = [];
    let overrideKey = "";
    let changeAt = 0;
    let transitionFrom: Scheduled[] = [];
    let visualKey = "set",
      visualChangedAt = 0;
    let previousVisual: Scheduled | null = null,
      visualFrom: Scheduled | null = null;
    const position = { x: 0.5, y: 0.5 };
    const peer = () =>
      window.opener ?? (window.parent !== window ? window.parent : null);
    const report = (category: string, message: string) => {
      if (category === "autoplay") setNeedsGesture(true);
      ch.send("error", { category, message });
    };
    function ensureAudio() {
      if (!audio) {
        audio = new SetAudio(report);
        setAnalyser(audio.analyser);
      }
      void audio
        .unlock()
        .catch(() => report("autoplay", "Click Play to enable audio."));
    }
    enableAudio.current = () => {
      audio?.dispose();
      audio = null;
      ensureAudio();
      setNeedsGesture(false);
    };
    function overrideItem(media: MediaRef, elapsed: number): Scheduled {
      const clip: Clip = {
        id: `override:${media.id}`,
        media,
        startMs: 0,
        durationMs: media.durationMs ?? 86400000,
        sourceOffsetMs: 0,
        fadeInMs: 0,
        fadeOutMs: 0,
      };
      return { clip, sourceMs: Math.max(0, elapsed), level: 1 };
    }
    function command(c: Command) {
      switch (c.action) {
        case "play":
          ensureAudio();
          transport.play();
          break;
        case "pause":
          transport.pause();
          break;
        case "stop":
          transport.stop();
          setNeedsGesture(false);
          break;
        case "restart":
          ensureAudio();
          transport.seek(0);
          transport.play();
          break;
        case "seek-audio":
          if (typeof c.value === "number") transport.seekAudio(c.value);
          break;
        case "seek":
          if (typeof c.value === "number") transport.seek(c.value);
          break;
        case "loop":
          transport.state.loop = !!c.value;
          break;
        case "mute":
          transport.state.muted = !!c.value;
          break;
        case "volume":
          if (typeof c.value === "number")
            transport.state.volume = Math.max(0, Math.min(1, c.value));
          break;
        case "audio":
        case "visual":
          transport.override(c.action, c.value as MediaRef | null);
          if (c.value) {
            ensureAudio();
            transport.play();
          }
          break;
      }
    }
    const ch = new SessionChannel(
      sessionId,
      connection,
      (m, gap) => {
        if (m.sender !== "operator") return;
        lastHeartbeat = performance.now();
        if (gap && m.type !== "snapshot") {
          ch.send("request-snapshot");
          return;
        }
        if (m.type === "superseded") {
          const target = (m.payload as { target?: string })?.target;
          if (target === connection) {
            superseded = true;
            authorised = false;
            // Unload the singleton WASM realm, not just its DOM canvas.
            window.location.replace("about:blank");
            audio?.dispose();
            audio = null;
            setView({ source: "", key: "black", opacity: 0 });
          }
          return;
        }
        if (m.type === "snapshot") {
          const p = m.payload as {
            target: string;
            state: TransportState;
            visuals: Record<string, string>;
          };
          if (p?.target !== connection) return;
          const state = parseState(p.state);
          if (!state) return;
          sources = p.visuals ?? {};
          transport.restore(state);
          controlSequence = m.sequence;
          authorised = true;
          badVisual.current = "";
          if (state.playing) ensureAudio();
          ch.send("ready");
        } else if (authorised && m.type === "command") {
          const parsed = parseCommand(m.payload);
          if (!parsed) return;
          command(parsed);
          controlSequence = m.sequence;
          ch.send("state", { state: transport.snapshot(), controlSequence });
        } else if (authorised && m.type === "input") {
          const e = parseInput(m.payload);
          if (e) {
            try {
              handle.current?.queueInput(
                runtimeInput(
                  e,
                  document.getElementById("visamp-stage")?.clientWidth ??
                    innerWidth,
                  document.getElementById("visamp-stage")?.clientHeight ??
                    innerHeight,
                  position,
                ),
              );
            } catch {
              report(
                "input",
                "Input could not be delivered to the visualisation.",
              );
            }
          }
        } else if (m.type === "reset-input") handle.current?.queueInput(null);
      },
      peer,
    );
    channel.current = ch;
    ch.send("hello");
    const metrics = () =>
      ch.send("metrics", {
        width: innerWidth,
        height: innerHeight,
        pixelRatio: devicePixelRatio,
      });
    window.addEventListener("resize", metrics);
    metrics();
    const heart = setInterval(() => {
      if (!authorised && !superseded) ch.send("hello");
      else ch.send("heartbeat");
      if (performance.now() - lastHeartbeat > 8000 && authorised) {
        authorised = false;
        audio?.dispose();
        audio = null;
        setView({ source: "", key: "black", opacity: 0 });
        // Recreate a clean realm and wait for a fresh lease before playing again.
        window.location.reload();
      }
    }, 1000);
    let raf = 0;
    function frame() {
      if (closed) return;
      raf = requestAnimationFrame(frame);
      if (!authorised) return;
      const current = transport.tick(),
        s = transport.state;
      let active = current.audio;
      if (s.audioOverride) {
        const elapsed = s.audioOverride.positionMs;
        active =
          s.audioOverride.media.durationMs &&
          elapsed >= s.audioOverride.media.durationMs
            ? []
            : [overrideItem(s.audioOverride.media, elapsed)];
      }
      const key = s.audioOverride?.media.id ?? "set";
      if (key !== overrideKey) {
        transitionFrom = previousAudio;
        changeAt = performance.now();
        overrideKey = key;
      }
      const p = Math.min(1, (performance.now() - changeAt) / 300);
      if (p < 1) {
        const nextIds = new Set(active.map((x) => x.clip.id));
        active = [
          ...transitionFrom
            .filter((x) => !nextIds.has(x.clip.id))
            .map((x) => ({
              ...x,
              sourceMs: x.sourceMs + performance.now() - changeAt,
              level: x.level * Math.cos((p * Math.PI) / 2),
            })),
          ...active.map((x) => ({
            ...x,
            level: x.level * Math.sin((p * Math.PI) / 2),
          })),
        ];
      }
      previousAudio = active;
      audio?.sync(
        s.complete || s.stopped ? [] : active,
        s.playing,
        s.muted ? 0 : s.volume,
        !s.complete &&
          !s.stopped &&
          !s.audioOverride &&
          current.nextAudio &&
          current.nextAudio.startMs - s.positionMs <= 5000
          ? [
              {
                clip: current.nextAudio,
                sourceMs: current.nextAudio.sourceOffsetMs,
                level: 0,
              },
            ]
          : [],
      );
      let visual =
        s.complete || s.stopped
          ? null
          : s.visualOverride
            ? overrideItem(s.visualOverride.media, s.visualOverride.positionMs)
            : visualFallback(current.visual);
      const nextVisualKey = s.visualOverride?.media.id ?? "set";
      if (nextVisualKey !== visualKey) {
        visualFrom = previousVisual;
        visualChangedAt = performance.now();
        visualKey = nextVisualKey;
      }
      const visualProgress = Math.min(
        1,
        (performance.now() - visualChangedAt) / 300,
      );
      if (visualProgress < 1 && !s.stopped && !s.complete) {
        visual =
          visualProgress < 0.5
            ? visualFrom
              ? {
                  ...visualFrom,
                  level: visualFrom.level * (1 - visualProgress * 2),
                }
              : null
            : visual
              ? { ...visual, level: visual.level * (visualProgress * 2 - 1) }
              : null;
      }
      previousVisual = visual;
      const next = {
        source: visual ? (sources[visual.clip.media.id] ?? "") : "",
        key: visual?.clip.media.id ?? "black",
        opacity:
          visual && badVisual.current !== visual.clip.media.id
            ? visual.level
            : 0,
      };
      setView((v) =>
        v.source === next.source &&
        v.key === next.key &&
        v.opacity === next.opacity
          ? v
          : next,
      );
      if (
        performance.now() - lastReport > 200 &&
        (s.playing || lastReportedPlaying)
      ) {
        lastReport = performance.now();
        lastReportedPlaying = s.playing;
        ch.send("state", { state: transport.snapshot(), controlSequence });
      }
    }
    raf = requestAnimationFrame(frame);
    const unload = () => ch.send("disconnect");
    window.addEventListener("pagehide", unload);
    return () => {
      closed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", metrics);
      clearInterval(heart);
      unload();
      window.removeEventListener("pagehide", unload);
      ch.close();
      audio?.dispose();
    };
  }, [sessionId, outputId, userId, loading]);
  useEffect(() => {
    if (preparation.status === "error")
      channel.current?.send("error", {
        category: "visual-assets",
        message: "Visual assets unavailable.",
      });
  }, [preparation.status]);
  return (
    <div
      ref={surface}
      data-vj-output
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        cursor: hidden ? "none" : "default",
        overflow: "hidden",
      }}
    >
      {needsGesture && (
        <button
          style={{
            position: "absolute",
            zIndex: 10,
            inset: "40% 25%",
            cursor: "pointer",
            background: "#161616",
            color: "white",
            border: "1px solid #777",
          }}
          onClick={() => enableAudio.current()}
        >
          Enable audio
        </button>
      )}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(100vw, 177.777778vh)",
          height: "min(100vh, 56.25vw)",
          opacity: preparation.status === "ready" ? view.opacity : 0,
        }}
      >
        <VisampCanvas
          ref={handle}
          active={!!user}
          interactive={false}
          hideErrors
          source={view.source}
          assets={assets}
          assetPreparation={preparation}
          analyser={analyser}
          className="h-full w-full"
          onCompileResult={(r) => {
            if (!r.ok) {
              badVisual.current = view.key;
              setView((v) => ({ ...v, opacity: 0 }));
              channel.current?.send("error", {
                category: "visual",
                message: "Visualisation could not compile.",
              });
            }
          }}
          onLog={(e) => {
            if (e.level === "error") {
              badVisual.current = view.key;
              channel.current?.send("error", {
                category: "visual",
                message: "Visualisation runtime error.",
              });
            }
          }}
        />
      </div>
    </div>
  );
}
