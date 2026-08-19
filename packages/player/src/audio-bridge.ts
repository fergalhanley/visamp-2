import { BeatDetector } from "./beat-detector";
import type { EngineModule } from "./types";

/**
 * Samples an AnalyserNode every animation frame and pushes the result into the
 * engine, where scripts read it as `$TIME_DOMAIN_DATA`, `$FREQUENCY_DATA` and
 * `$BEAT`.
 *
 * The analyser is supplied by the host rather than created here. A Web Audio
 * graph cannot span two AudioContexts, so an analyser made in this package
 * could never see audio produced by the app's own microphone, file and stream
 * nodes — it would read silence forever. Owning the sampling but borrowing the
 * node is what keeps a single graph.
 *
 * Buffer sizes follow the caller's `fftSize`, so resolution stays their choice.
 */
export function startAudioBridge(
  engine: EngineModule,
  analyser: AnalyserNode,
): () => void {
  const timeDomain = new Uint8Array(analyser.fftSize);
  const frequency = new Uint8Array(analyser.frequencyBinCount);
  const detector = new BeatDetector();

  let frame = 0;

  const sample = (now: number) => {
    analyser.getByteTimeDomainData(timeDomain);
    analyser.getByteFrequencyData(frequency);

    // The detector sizes its band in Hz, so it needs the context's rate rather
    // than assuming 44.1k — 48k contexts are common and would shift the band.
    const beat = detector.detect(frequency, now, analyser.context.sampleRate);

    engine.set_audio_frame(timeDomain, frequency, beat);

    frame = requestAnimationFrame(sample);
  };

  frame = requestAnimationFrame(sample);

  return () => {
    cancelAnimationFrame(frame);
    // Leave the engine seeing silence rather than the last frame frozen.
    engine.clear_audio_frame();
  };
}
