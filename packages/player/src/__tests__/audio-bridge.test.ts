import { afterEach, expect, it, vi } from "vitest";
import { startAudioBridge } from "../audio-bridge";
import type { EngineModule } from "../types";

class Port {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
}
class Node {
  static instances: Node[] = [];
  port = new Port();
  connect = vi.fn();
  disconnect = vi.fn();
  onprocessorerror: (() => void) | null = null;
  constructor() {
    Node.instances.push(this);
  }
}
function setup(module = Promise.resolve()) {
  Node.instances = [];
  vi.stubGlobal("AudioWorkletNode", Node);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const context = Object.assign(new EventTarget(), {
    sampleRate: 48000,
    state: "running",
    destination: {},
    audioWorklet: { addModule: vi.fn(() => module) },
  });
  const analyser = Object.assign(new EventTarget(), {
    context,
    fftSize: 2048,
    frequencyBinCount: 1024,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteTimeDomainData: vi.fn(),
    getByteFrequencyData: vi.fn(),
  });
  const engine = {
    set_audio_analysis: vi.fn(),
    clear_audio_frame: vi.fn(),
  };
  const error = vi.fn();
  const stop = startAudioBridge(
    engine as unknown as EngineModule,
    analyser as unknown as AnalyserNode,
    error,
  );
  return { context, analyser, engine, error, stop };
}
const message = (beats: number, onsets: number, generation = 0) => ({
  data: {
    waveform: new Float32Array([0.5]),
    spectrum: new Float32Array([0.2]),
    sampleRate: 48000,
    level: 0.3,
    beatCount: beats,
    onsetCount: onsets,
    onsetStrength: 0.7,
    generation,
  },
});
afterEach(() => vi.unstubAllGlobals());

it("delivers independent audio events without running an animation frame", async () => {
  const s = setup();
  await Promise.resolve();
  const node = Node.instances[0]!;
  node.port.onmessage!(message(2, 3));
  expect(requestAnimationFrame).not.toHaveBeenCalled();
  expect(s.analyser.getByteFrequencyData).not.toHaveBeenCalled();
  expect(s.analyser.getByteTimeDomainData).not.toHaveBeenCalled();
  expect(s.engine.set_audio_analysis.mock.calls[0]?.slice(4, 6)).toEqual([
    true,
    true,
  ]);
  node.port.onmessage!(message(2, 3));
  expect(s.engine.set_audio_analysis.mock.calls[1]?.slice(4, 6)).toEqual([
    false,
    false,
  ]);
  expect(node.port.postMessage).toHaveBeenCalledWith("ack");
  s.stop();
  expect(node.port.close).toHaveBeenCalledOnce();
  expect(s.analyser.disconnect).toHaveBeenCalledWith(node);
});
it("resets on source/context changes and rejects queued old-generation events", async () => {
  const s = setup();
  await Promise.resolve();
  const node = Node.instances[0]!;
  s.analyser.dispatchEvent(new Event("visamp-source-reset"));
  node.port.onmessage!(message(10, 10));
  expect(s.engine.set_audio_analysis).not.toHaveBeenCalled();
  node.port.onmessage!(message(1, 1, 1));
  expect(s.engine.set_audio_analysis).toHaveBeenCalledOnce();
  s.context.state = "suspended";
  s.context.dispatchEvent(new Event("statechange"));
  node.port.onmessage!(message(2, 2, 2));
  expect(s.engine.set_audio_analysis).toHaveBeenCalledOnce();
  s.stop();
});
it("cancels async startup and reports module failures without leaking nodes", async () => {
  let resolve!: () => void;
  const s = setup(
    new Promise<void>((r) => {
      resolve = r;
    }),
  );
  s.stop();
  resolve();
  await Promise.resolve();
  expect(Node.instances).toHaveLength(0);
  const bad = setup(Promise.reject(Error("missing worklet")));
  await Promise.resolve();
  await Promise.resolve();
  expect(bad.error).toHaveBeenCalled();
  bad.stop();
});
