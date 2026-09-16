import type { EngineModule } from "./types";

const modules = new WeakMap<BaseAudioContext, Promise<void>>();
interface DetectionMessage {
  waveform: Float32Array;
  spectrum: Float32Array;
  sampleRate: number;
  level: number;
  beatCount: number;
  onsetCount: number;
  onsetStrength: number;
  generation: number;
}

/**
 * Normalized audio::detect values come from the audio thread; byte frequency
 * uses the browser analyser at animation-frame cadence for compatibility.
 * Hosts serve /audio-detect-worklet.mjs (the VisAmp web app's public asset).
 */
export function startAudioBridge(
  engine: EngineModule,
  analyser: AnalyserNode,
  onError: (message: string) => void = console.error,
): () => void {
  const context = analyser.context;
  // Use the same browser analyser and settings as the former frequency global.
  analyser.fftSize = 2048;
  analyser.minDecibels = -100;
  analyser.maxDecibels = -30;
  analyser.smoothingTimeConstant = 0.8;
  const frequency = new Uint8Array(1024);
  let frequencyFrame = 0;
  let disposed = false;
  let node: AudioWorkletNode | undefined;
  let beats = 0,
    onsets = 0,
    generation = 0;

  const sampleFrequency = () => {
    if (disposed) return;
    try {
      if (context.state === "running") analyser.getByteFrequencyData(frequency);
      else frequency.fill(0);
      engine.set_audio_frequency(frequency);
    } catch (error) {
      onError(`Frequency analysis failed: ${String(error)}`);
    }
    frequencyFrame = requestAnimationFrame(sampleFrequency);
  };
  frequencyFrame = requestAnimationFrame(sampleFrequency);

  const reset = () => {
    generation++;
    beats = onsets = 0;
    engine.clear_audio_frame();
    node?.port.postMessage({ type: "reset", generation });
  };
  analyser.addEventListener("visamp-source-reset", reset);
  context.addEventListener("statechange", reset);

  const start = async () => {
    if (!context.audioWorklet)
      throw Error(
        "AudioWorklet is unavailable; audio::detect needs a secure context and AudioWorklet support.",
      );
    let module = modules.get(context);
    if (!module) {
      module = context.audioWorklet.addModule("/audio-detect-worklet.mjs");
      modules.set(context, module);
      module.catch(() => modules.delete(context));
    }
    await module;
    if (disposed) return;
    node = new AudioWorkletNode(context, "visript-audio-detect", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    node.port.onmessage = ({ data }: MessageEvent<DetectionMessage>) => {
      if (disposed) return;
      try {
        if (data.generation !== generation || context.state !== "running")
          return;
        engine.set_audio_analysis(
          data.waveform,
          data.spectrum,
          data.sampleRate,
          data.level,
          data.beatCount > beats,
          data.onsetCount > onsets,
          data.onsetStrength,
        );
        beats = data.beatCount;
        onsets = data.onsetCount;
      } catch (error) {
        engine.clear_audio_frame();
        onError(`Audio analysis failed: ${String(error)}`);
      } finally {
        node?.port.postMessage("ack");
      }
    };
    node.onprocessorerror = () => {
      engine.clear_audio_frame();
      onError(
        "Audio analysis processor failed; reload the player to restart detection.",
      );
    };
    node.port.postMessage({ type: "reset", generation });
    analyser.connect(node);
    // The processor outputs silence, so this adds no monitoring/doubled sound.
    node.connect(context.destination);
  };
  void start().catch((error) => {
    if (!disposed) onError(`Audio analysis could not start: ${String(error)}`);
  });

  return () => {
    disposed = true;
    cancelAnimationFrame(frequencyFrame);
    analyser.removeEventListener("visamp-source-reset", reset);
    context.removeEventListener("statechange", reset);
    if (node) {
      analyser.disconnect(node);
      node.port.postMessage("stop");
      node.port.onmessage = null;
      node.port.close();
      node.disconnect();
    }
    engine.clear_audio_frame();
  };
}
