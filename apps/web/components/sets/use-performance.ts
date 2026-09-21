"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SetTransport, type TransportState } from "@/lib/sets/transport";
import {
  SessionChannel,
  parseStateReport,
  type Command,
  type VisualInputEvent,
} from "@/lib/sets/protocol";
import { type SetContent, type MediaRef, emptySet } from "@/lib/sets/model";
import { resolveSet } from "@/lib/sets/client";
import { track } from "@/lib/analytics/client";
export function usePerformance() {
  const [session] = useState(() => crypto.randomUUID()),
    [embeddedId, setEmbeddedId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<
    "Embedded" | "Pop-out connected" | "Pop-out disconnected"
  >("Embedded");
  const [state, setState] = useState<TransportState>(() =>
      new SetTransport(() => 0).snapshot(),
    ),
    [errors, setErrors] = useState<string[]>([]);
  const iframe = useRef<HTMLIFrameElement>(null),
    popup = useRef<Window | null>(null),
    popupId = useRef("");
  const controller = useRef<SetTransport | null>(null),
    channel = useRef<SessionChannel | null>(null),
    sources = useRef<Record<string, string>>({}),
    active = useRef(""),
    lastHeartbeat = useRef(0),
    connectedAt = useRef(0),
    loadGeneration = useRef(0),
    controlSequence = useRef(0);
  const current = () => controller.current!;
  const snapshot = useCallback((target: string) => {
    controlSequence.current =
      channel.current?.send("snapshot", {
        target,
        state: controller.current!.snapshot(),
        visuals: sources.current,
      }) ?? controlSequence.current;
  }, []);
  useEffect(() => {
    const transport =
      controller.current ?? new SetTransport(() => performance.now());
    controller.current = transport;
    let closed = false;
    const ch = new SessionChannel(
      session,
      "operator",
      (m, gap) => {
        const isPopup =
          !!popupId.current && m.sender.startsWith(popupId.current + ":");
        const isEmbedded = m.sender.startsWith(embeddedId + ":");
        if (!isPopup && !isEmbedded) return;
        if (m.type === "hello") {
          connectedAt.current = performance.now();
          if (isPopup) {
            if (active.current && active.current !== m.sender)
              ch.send("superseded", { target: active.current });
            active.current = m.sender;
          } else if (
            active.current.startsWith(popupId.current + ":") &&
            popupId.current
          )
            return;
          else active.current = m.sender;
          lastHeartbeat.current = performance.now();
          snapshot(m.sender);
          return;
        }
        if (m.sender !== active.current) return;
        if (m.type === "ready" && isPopup) {
          setStatus("Pop-out connected");
          track("vj_output_popped_out");
        }
        lastHeartbeat.current = performance.now();
        if (m.type === "heartbeat") ch.send("heartbeat");
        if (gap || m.type === "request-snapshot") {
          snapshot(m.sender);
          return;
        }
        if (m.type === "state") {
          const s = parseStateReport(m.payload, controlSequence.current);
          if (s) {
            const completed = !transport.state.complete && s.complete;
            transport.restore(s);
            setState(s);
            if (completed) track("vj_set_completed");
          }
        }
        if (m.type === "error") {
          const p = m.payload as { category?: string; message?: string };
          setErrors((old) => [...old.slice(-9), p.message ?? "Playback error"]);
          track("vj_playback_error", {
            failure_category: p.category ?? "unknown",
          });
        }
        if (m.type === "disconnect" && isPopup)
          lastHeartbeat.current = performance.now() - 1000;
      },
      () =>
        popup.current && !popup.current.closed
          ? popup.current
          : (iframe.current?.contentWindow ?? null),
    );
    channel.current = ch;
    controlSequence.current = 0;
    function recover() {
      if (closed) return;
      ch.send("superseded", { target: active.current });
      active.current = "";
      popupId.current = "";
      popup.current?.close();
      setStatus("Pop-out disconnected");
      setEmbeddedId(crypto.randomUUID());
      track("vj_output_disconnected");
    }
    const heartbeat = setInterval(() => {
      ch.send("heartbeat");
      // Initial WASM compilation and asset preparation can stall a busy main thread.
      // Warn promptly, but allow startup headroom before revoking output authority.
      const silence = performance.now() - lastHeartbeat.current;
      const timeout =
        performance.now() - connectedAt.current < 30000 ? 15000 : 8000;
      if (
        active.current.startsWith(popupId.current + ":") &&
        popupId.current &&
        (popup.current?.closed || silence > timeout)
      )
        recover();
      else if (active.current && silence > 4000) {
        setErrors((old) =>
          old.at(-1) ===
          "Output heartbeat delayed. Checking connection; Restart Output is available."
            ? old
            : [
                ...old,
                "Output heartbeat delayed. Checking connection; Restart Output is available.",
              ],
        );
      }
    }, 1000);
    const tick = setInterval(() => {
      if (!transport.state.playing) return;
      transport.tick();
      setState(transport.snapshot());
    }, 100);
    return () => {
      closed = true;
      clearInterval(heartbeat);
      clearInterval(tick);
      ch.send("superseded", { target: active.current });
      ch.close();
    };
    // embedded identity changes only when output recovery needs a fresh frame.
  }, [session, embeddedId, snapshot]);
  const send = useCallback((command: Command) => {
    const t = current();
    switch (command.action) {
      case "play":
        t.play();
        break;
      case "pause":
        t.pause();
        break;
      case "stop":
        t.stop();
        break;
      case "restart":
        t.seek(0);
        t.play();
        break;
      case "seek":
        t.seek(Number(command.value));
        break;
      case "loop":
        t.state.loop = !!command.value;
        break;
      case "volume":
        t.state.volume = Number(command.value);
        break;
      case "mute":
        t.state.muted = !!command.value;
        break;
      case "audio":
      case "visual":
        t.override(command.action, command.value as MediaRef | null);
        if (command.value) t.play();
        break;
    }
    controlSequence.current =
      channel.current?.send("command", command) ?? controlSequence.current;
    setState(t.snapshot());
  }, []);
  const load = useCallback(
    async (set: SetContent, preservePosition = false) => {
      const generation = ++loadGeneration.current;
      const position = preservePosition ? current().time() : 0;
      const resolved = await resolveSet(set);
      if (generation !== loadGeneration.current) return resolved;
      current().load(set);
      if (preservePosition) current().seek(position);
      sources.current = resolved.visuals;
      setErrors([]);
      setState(current().snapshot());
      if (active.current) snapshot(active.current);
      return resolved;
    },
    [snapshot],
  );
  const replaceSet = useCallback(
    (set: SetContent) => {
      ++loadGeneration.current;
      const position = current().time();
      current().load(set);
      current().seek(position);
      setState(current().snapshot());
      if (active.current) snapshot(active.current);
    },
    [snapshot],
  );
  const overrideGeneration = useRef({ audio: 0, visual: 0 });
  const override = useCallback(
    async (kind: "audio" | "visual", media: MediaRef | null) => {
      try {
        const generation = ++overrideGeneration.current[kind];
        if (media?.kind === "visual") {
          const set = emptySet();
          set.visualClips = [
            {
              id: media.id,
              media,
              startMs: 0,
              durationMs: 1000,
              sourceOffsetMs: 0,
              fadeInMs: 0,
              fadeOutMs: 0,
            },
          ];
          const resolved = await resolveSet(set);
          if (generation !== overrideGeneration.current[kind]) return;
          if (resolved.unavailable[media.id]) {
            setErrors((old) => [...old, resolved.unavailable[media.id]!]);
            return;
          }
          sources.current = { ...sources.current, ...resolved.visuals };
        }
        send({ action: kind, value: media });
        if (active.current) snapshot(active.current);
        track(media ? "vj_override_started" : "vj_override_cleared", {
          type: kind,
        });
      } catch (e) {
        setErrors((old) => [
          ...old,
          e instanceof Error ? e.message : "Unable to load override.",
        ]);
      }
    },
    [send, snapshot],
  );
  const popout = () => {
    const id = crypto.randomUUID();
    const win = window.open(
      `/vj-mode/output/${session}?output=${id}`,
      "visamp-vj-output",
      "popup,width=1280,height=720",
    );
    if (!win) {
      setErrors((old) => [
        ...old,
        "Popup blocked. Allow popups and try again.",
      ]);
      return;
    }
    popup.current = win;
    popupId.current = id;
  };
  const input = (event: VisualInputEvent | null) =>
    channel.current?.send(event ? "input" : "reset-input", event);
  const restart = () => {
    channel.current?.send("superseded", { target: active.current });
    active.current = "";
    popupId.current = "";
    popup.current?.close();
    setStatus("Embedded");
    setErrors([]);
    setEmbeddedId(crypto.randomUUID());
  };
  return {
    session,
    embeddedId,
    attachFrame: (node: HTMLIFrameElement | null) => {
      iframe.current = node;
    },
    state,
    status,
    errors,
    load,
    replaceSet,
    send,
    override,
    popout,
    input,
    restart,
    embedded: status !== "Pop-out connected",
  };
}
