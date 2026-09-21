import { afterEach, describe, it, expect, vi } from "vitest";
import {
  SessionChannel,
  parseMessage,
  parseInput,
  parseState,
  parseStateReport,
  parseCommand,
} from "./protocol";
import { SetTransport } from "./transport";
import { PlaybackClock } from "./clock";
import { runtimeInput } from "./input";
const packet = {
  version: 1,
  sessionId: "session",
  sender: "output:connection",
  sequence: 1,
  type: "hello",
  payload: null,
};
afterEach(() => vi.unstubAllGlobals());
it("rejects wrong session/version, unknown types and invalid sequences", () => {
  expect(parseMessage(packet, "session")).not.toBeNull();
  for (const m of [
    { ...packet, version: 2 },
    { ...packet, sequence: 0 },
    { ...packet, sequence: 1.2 },
    { ...packet, type: "run-code" },
  ])
    expect(parseMessage(m, "session")).toBeNull();
  expect(parseMessage(packet, "different")).toBeNull();
});
it("validates commands and input payloads", () => {
  for (const c of [
    null,
    { action: "seek", value: Infinity },
    { action: "volume", value: 2 },
    { action: "audio", value: { id: "x" } },
    { action: "loop", value: 1 },
  ])
    expect(parseCommand(c)).toBeNull();
  expect(parseCommand({ action: "audio", value: null })).not.toBeNull();
  expect(
    parseInput({
      type: "pointer",
      action: "move",
      dx: 0,
      dy: 0,
      buttons: 0,
      t: 1,
      x: 2,
    }),
  ).toBeNull();
  expect(
    parseInput({
      type: "key",
      action: "down",
      code: "KeyA",
      repeat: false,
      modifiers: [],
      t: 1,
    }),
  ).not.toBeNull();
});
describe("session channel", () => {
  it("detects gaps, rejects duplicate sequences and accepts a new output connection", () => {
    const instances: MockChannel[] = [];
    class MockChannel {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor() {
        instances.push(this);
      }
    }
    vi.stubGlobal("BroadcastChannel", MockChannel);
    const receive = vi.fn();
    const channel = new SessionChannel(
      "session",
      "operator",
      receive,
      () => null,
    );
    instances[0]!.onmessage!({ data: packet });
    instances[0]!.onmessage!({ data: { ...packet, sequence: 3 } });
    instances[0]!.onmessage!({ data: { ...packet, sequence: 2 } });
    instances[0]!.onmessage!({ data: { ...packet, sender: "output:refresh" } });
    expect(receive.mock.calls.map((c) => c[1])).toEqual([false, true, false]);
    channel.close();
    channel.send("reset-input");
    expect(instances[0]!.postMessage).not.toHaveBeenCalled();
  });
  it("checks origin and source in postMessage fallback", () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const peer = {} as Window;
    const receive = vi.fn();
    const channel = new SessionChannel(
      "session",
      "operator",
      receive,
      () => peer,
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://evil.example",
        source: peer,
        data: packet,
      }),
    );
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: null,
        data: packet,
      }),
    );
    expect(receive).not.toHaveBeenCalled();
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: peer,
        data: packet,
      }),
    );
    expect(receive).toHaveBeenCalledOnce();
    channel.close();
  });
});
it("recovers a snapshot, independent overrides and controls without mutating the saved set", () => {
  let now = 0;
  const a = new SetTransport(() => now);
  const set = a.state.set;
  set.audioClips = [
    {
      id: "a",
      media: {
        id: "a",
        kind: "audio",
        source: "file",
        title: "Audio",
        attribution: "Artist",
      },
      startMs: 0,
      durationMs: 10000,
      sourceOffsetMs: 2000,
      fadeInMs: 0,
      fadeOutMs: 0,
    },
  ];
  a.load(set);
  a.play();
  now = 3000;
  a.override("audio", {
    id: "b",
    kind: "audio",
    source: "file",
    title: "Override",
    attribution: "Artist",
  });
  const raw = a.snapshot();
  const b = new SetTransport(() => now);
  const parsed = parseState(JSON.parse(JSON.stringify(raw)));
  expect(parsed).not.toBeNull();
  b.restore(parsed!);
  now = 5000;
  expect(b.tick().audio[0]!.sourceMs).toBe(7000);
  expect(b.state.audioOverride?.media.id).toBe("b");
  b.override("audio", null);
  expect(b.tick().audio[0]!.clip.id).toBe("a");
  expect(set.audioClips).toHaveLength(1);
});
it("keeps time moving through suspended audio and rebases without jumps", () => {
  let wall = 0,
    audio: number | null = null;
  const clock = new PlaybackClock(
    () => wall,
    () => audio,
  );
  wall = 100;
  expect(clock.now()).toBe(100);
  audio = 0;
  wall = 200;
  expect(clock.now()).toBe(200);
  audio = 50;
  wall = 1000;
  expect(clock.now()).toBe(250);
  audio = null;
  wall = 1100;
  expect(clock.now()).toBe(350);
  audio = 50;
  wall = 1200;
  expect(clock.now()).toBe(450);
});
it("maps input to runtime dimensions with bounded relative pointer position", () => {
  const p = { x: 0.5, y: 0.5 };
  expect(
    runtimeInput(
      { type: "pointer", action: "move", dx: 10, dy: -20, buttons: 0, t: 0 },
      100,
      100,
      p,
    ),
  ).toMatchObject({ kind: "pointer_move", x: 60, y: 30 });
  expect(
    runtimeInput(
      {
        type: "key",
        action: "up",
        code: "KeyA",
        repeat: false,
        modifiers: ["shift"],
        t: 0,
      },
      100,
      100,
      p,
    ),
  ).toMatchObject({ kind: "key_up", code: "KeyA", key: "A", shift: true });
});

it("rejects stale output telemetry after Return to Set or a transport change", () => {
  const t = new SetTransport(() => 0);
  const state = t.snapshot();
  expect(parseStateReport({ state, controlSequence: 9 }, 10)).toBeNull();
  expect(parseStateReport({ state, controlSequence: 10 }, 10)).toEqual(state);
  expect(parseStateReport({ state, controlSequence: NaN }, 0)).toBeNull();
});
