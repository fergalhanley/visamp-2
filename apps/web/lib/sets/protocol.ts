import { parseSet, type MediaRef } from "./model";
import type { TransportState } from "./transport";
export type VisualInputEvent =
  | {
      type: "key";
      action: "down" | "up";
      code: string;
      key?: string;
      repeat: boolean;
      modifiers: string[];
      t: number;
    }
  | {
      type: "pointer";
      action: "move" | "down" | "up";
      x?: number;
      y?: number;
      dx: number;
      dy: number;
      button?: number;
      buttons: number;
      t: number;
    }
  | { type: "wheel"; dx: number; dy: number; dz: number; t: number };
export type Command = {
  action:
    | "play"
    | "pause"
    | "stop"
    | "restart"
    | "seek"
    | "seek-audio"
    | "loop"
    | "volume"
    | "mute"
    | "audio"
    | "visual";
  value?: number | boolean | MediaRef | null;
};
export type Message = {
  version: 1;
  sessionId: string;
  sender: string;
  sequence: number;
  type:
    | "hello"
    | "ready"
    | "heartbeat"
    | "disconnect"
    | "request-snapshot"
    | "snapshot"
    | "state"
    | "command"
    | "input"
    | "reset-input"
    | "metrics"
    | "error"
    | "superseded";
  payload: unknown;
};
const types = new Set([
  "hello",
  "ready",
  "heartbeat",
  "disconnect",
  "request-snapshot",
  "snapshot",
  "state",
  "command",
  "input",
  "reset-input",
  "metrics",
  "error",
  "superseded",
]);
export function parseMessage(raw: unknown, sessionId: string): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Message;
  if (
    m.version !== 1 ||
    m.sessionId !== sessionId ||
    typeof m.sender !== "string" ||
    m.sender.length > 128 ||
    !Number.isSafeInteger(m.sequence) ||
    m.sequence < 1 ||
    !types.has(m.type)
  )
    return null;
  return m;
}
export function parseState(raw: unknown): TransportState | null {
  try {
    const s = raw as TransportState;
    if (
      !s ||
      !Number.isFinite(s.positionMs) ||
      s.positionMs < 0 ||
      typeof s.playing !== "boolean" ||
      typeof s.loop !== "boolean" ||
      typeof s.complete !== "boolean" ||
      typeof s.stopped !== "boolean" ||
      typeof s.muted !== "boolean" ||
      !Number.isFinite(s.volume) ||
      s.volume < 0 ||
      s.volume > 1
    )
      return null;
    const set = parseSet(s.set);
    if (
      (s.audioOverride &&
        !parseCommand({ action: "audio", value: s.audioOverride.media })) ||
      (s.visualOverride &&
        !parseCommand({ action: "visual", value: s.visualOverride.media }))
    )
      return null;
    for (const o of [s.audioOverride, s.visualOverride])
      if (
        o !== null &&
        (!o ||
          !Number.isFinite(o.positionMs) ||
          o.positionMs < 0 ||
          !o.media ||
          typeof o.media.id !== "string")
      )
        return null;
    return { ...s, set };
  } catch {
    return null;
  }
}
/** Ignore output telemetry that predates the latest operator command/snapshot. */
export function parseStateReport(
  raw: unknown,
  minimumControlSequence: number,
): TransportState | null {
  if (!raw || typeof raw !== "object") return null;
  const report = raw as { controlSequence: number; state: unknown };
  if (
    !Number.isSafeInteger(report.controlSequence) ||
    report.controlSequence < minimumControlSequence
  )
    return null;
  return parseState(report.state);
}
export function parseInput(raw: unknown): VisualInputEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as VisualInputEvent;
  if (!Number.isFinite(e.t)) return null;
  if (e.type === "key")
    return ["down", "up"].includes(e.action) &&
      typeof e.code === "string" &&
      e.code.length > 0 &&
      e.code.length < 64 &&
      (e.key === undefined ||
        (typeof e.key === "string" &&
          e.key.length > 0 &&
          e.key.length < 128)) &&
      typeof e.repeat === "boolean" &&
      Array.isArray(e.modifiers) &&
      e.modifiers.every((m) => ["shift", "control", "alt", "meta"].includes(m))
      ? e
      : null;
  if (e.type === "wheel")
    return [e.dx, e.dy, e.dz].every(Number.isFinite) ? e : null;
  if (e.type === "pointer")
    return ["move", "down", "up"].includes(e.action) &&
      [e.dx, e.dy].every(Number.isFinite) &&
      Number.isInteger(e.buttons) &&
      e.buttons >= 0 &&
      e.buttons <= 31 &&
      (e.button === undefined ||
        (Number.isInteger(e.button) && e.button >= 0 && e.button <= 4)) &&
      (e.x === undefined || (Number.isFinite(e.x) && e.x >= 0 && e.x <= 1)) &&
      (e.y === undefined || (Number.isFinite(e.y) && e.y >= 0 && e.y <= 1))
      ? e
      : null;
  return null;
}
export class SessionChannel {
  private sequence = 0;
  private closed = false;
  private received = new Map<string, number>();
  private channel: BroadcastChannel | null = null;
  private listener: (e: MessageEvent) => void;
  constructor(
    readonly session: string,
    readonly sender: string,
    private receive: (m: Message, gap: boolean) => void,
    private peer: () => Window | null,
  ) {
    this.listener = (e) => {
      if (e.origin !== location.origin || e.source !== this.peer()) return;
      this.accept(e.data);
    };
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`visamp-vj:${session}`);
      this.channel.onmessage = (e) => this.accept(e.data);
    } else window.addEventListener("message", this.listener);
  }
  private accept(raw: unknown) {
    const m = parseMessage(raw, this.session);
    if (!m || m.sender === this.sender) return;
    const last = this.received.get(m.sender) ?? 0;
    if (m.sequence <= last) return;
    this.received.set(m.sender, m.sequence);
    this.receive(m, last !== 0 && m.sequence !== last + 1);
  }
  send(type: Message["type"], payload: unknown = null) {
    if (this.closed) return;
    const m: Message = {
      version: 1,
      sessionId: this.session,
      sender: this.sender,
      sequence: ++this.sequence,
      type,
      payload,
    };
    if (this.channel) this.channel.postMessage(m);
    else this.peer()?.postMessage(m, location.origin);
    return m.sequence;
  }
  close() {
    this.closed = true;
    this.channel?.close();
    window.removeEventListener("message", this.listener);
  }
}

export function parseCommand(raw: unknown): Command | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Command;
  if (["play", "pause", "stop", "restart"].includes(c.action))
    return { action: c.action };
  if (c.action === "seek" || c.action === "seek-audio")
    return typeof c.value === "number" &&
      Number.isFinite(c.value) &&
      c.value >= 0
      ? c
      : null;
  if (c.action === "volume")
    return typeof c.value === "number" &&
      Number.isFinite(c.value) &&
      c.value >= 0 &&
      c.value <= 1
      ? c
      : null;
  if (c.action === "loop" || c.action === "mute")
    return typeof c.value === "boolean" ? c : null;
  if (c.action === "audio" || c.action === "visual") {
    if (c.value === null) return c;
    try {
      const set = {
        schemaVersion: 1,
        name: "validation",
        description: "",
        loop: false,
        aspectRatio: "16:9",
        audioClips: [],
        visualClips: [],
        [c.action === "audio" ? "audioClips" : "visualClips"]: [
          {
            id: "override",
            media: c.value,
            startMs: 0,
            durationMs: 1,
            sourceOffsetMs: 0,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        ],
      };
      parseSet(set);
      return c;
    } catch {
      return null;
    }
  }
  return null;
}
