/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Visript audio analysis. No DOM/main-thread dependencies; also tested in Node.
export const FFT_SIZE = 2048;
export const HOP_SIZE = 512;

export class AudioAnalysis {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.ring = new Float32Array(FFT_SIZE);
    this.real = new Float64Array(FFT_SIZE);
    this.imag = new Float64Array(FFT_SIZE);
    this.window = Float64Array.from(
      { length: FFT_SIZE },
      (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / FFT_SIZE),
    );
    this.previous = new Float32Array(FFT_SIZE / 2);
    this.spectrum = new Float32Array(FFT_SIZE / 2);
    this.waveform = new Float32Array(1024);
    this.position = 0;
    this.samples = 0;
    this.level = 0;
    this.fluxBaseline = 0;
    this.lowBaseline = 0;
    this.lastOnset = -Infinity;
    this.lastLow = -Infinity;
    this.interval = 0;
    this.beatCount = 0;
    this.onsetCount = 0;
    this.onsetStrength = 0;
  }

  // Accept actual quantum length, not an assumed 128 samples. Downmix to mono.
  push(channels, frames, onSnapshot) {
    for (let i = 0; i < frames; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] ?? 0;
      value /= channels.length || 1;
      this.ring[this.position] = Number.isFinite(value)
        ? Math.max(-1, Math.min(1, value))
        : 0;
      this.position = (this.position + 1) % FFT_SIZE;
      this.samples++;
      if (this.samples >= FFT_SIZE && this.samples % HOP_SIZE === 0) {
        this.analyse();
        onSnapshot(this);
      }
    }
  }

  analyse() {
    let energy = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const v = this.ring[(this.position + i) % FFT_SIZE];
      energy += v * v;
      this.real[i] = v * this.window[i];
      this.imag[i] = 0;
      if (i >= FFT_SIZE - this.waveform.length)
        this.waveform[i - (FFT_SIZE - this.waveform.length)] = v;
    }
    const rms = Math.sqrt(energy / FFT_SIZE);
    const dt = HOP_SIZE / this.sampleRate;
    const tau = rms > this.level ? 0.025 : 0.15;
    this.level += (1 - Math.exp(-dt / tau)) * (rms - this.level);

    // Iterative radix-2 FFT, Hann window, coherent-gain-corrected amplitudes.
    for (let i = 1, j = 0; i < FFT_SIZE; i++) {
      let bit = FFT_SIZE >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const swap = this.real[i];
        this.real[i] = this.real[j];
        this.real[j] = swap;
      }
    }
    for (let size = 2; size <= FFT_SIZE; size *= 2) {
      const angle = (-2 * Math.PI) / size;
      const wr = Math.cos(angle),
        wi = Math.sin(angle);
      for (let start = 0; start < FFT_SIZE; start += size) {
        let cr = 1,
          ci = 0;
        for (let j = 0; j < size / 2; j++) {
          const a = start + j,
            b = a + size / 2;
          const tr = cr * this.real[b] - ci * this.imag[b];
          const ti = cr * this.imag[b] + ci * this.real[b];
          this.real[b] = this.real[a] - tr;
          this.imag[b] = this.imag[a] - ti;
          this.real[a] += tr;
          this.imag[a] += ti;
          const next = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = next;
        }
      }
    }
    let flux = 0,
      lowFlux = 0;
    for (let i = 0; i < this.spectrum.length; i++) {
      const amplitude = Math.min(
        1,
        (Math.hypot(this.real[i], this.imag[i]) * (i === 0 ? 2 : 4)) / FFT_SIZE,
      );
      const delta = Math.max(0, amplitude - this.previous[i]);
      // DC is not an attack; low-frequency attacks seed the rhythm estimate.
      if (i > 0) flux += delta;
      const hz = (i * this.sampleRate) / FFT_SIZE;
      if (hz >= 20 && hz < 250) lowFlux += delta;
      this.spectrum[i] = amplitude;
      this.previous[i] = amplitude;
    }
    const now = this.samples / this.sampleRate;
    const strength = Math.max(0, Math.min(1, flux / 2));
    this.onsetStrength = strength;
    if (
      rms > 0.001 &&
      flux > Math.max(0.04, this.fluxBaseline * 3) &&
      now - this.lastOnset >= 0.08
    ) {
      this.onsetCount++;
      this.lastOnset = now;
    }
    if (
      rms > 0.001 &&
      lowFlux > Math.max(0.04, this.lowBaseline * 3) &&
      now - this.lastLow >= 0.25
    ) {
      const gap = now - this.lastLow;
      // Confirm recurrence before calling an attack a rhythmic beat. No tempo
      // or phase is advertised; high-frequency onsets do not become beats.
      if (gap >= 0.25 && gap <= 1.5) {
        if (
          this.interval > 0 &&
          Math.abs(gap - this.interval) <= this.interval * 0.2
        ) {
          this.beatCount++;
          this.interval = 0.8 * this.interval + 0.2 * gap;
        } else this.interval = gap;
      } else this.interval = 0;
      this.lastLow = now;
    }
    const alpha = 1 - Math.exp(-dt / 0.3);
    this.fluxBaseline += alpha * (flux - this.fluxBaseline);
    this.lowBaseline += alpha * (lowFlux - this.lowBaseline);
  }
}

if (typeof registerProcessor !== "undefined") {
  class VisriptAudioDetector extends AudioWorkletProcessor {
    constructor() {
      super();
      this.analysis = new AudioAnalysis(sampleRate);
      this.inFlight = false;
      this.stopped = false;
      this.peak = 0;
      this.generation = 0;
      this.port.onmessage = ({ data }) => {
        if (data === "ack") this.inFlight = false;
        if (data === "stop") this.stopped = true;
        if (data?.type === "reset") {
          this.analysis = new AudioAnalysis(sampleRate);
          this.peak = 0;
          this.generation = data.generation;
        }
      };
    }
    process(inputs, outputs) {
      if (this.stopped) return false;
      const channels = inputs[0] ?? [];
      const frames = outputs[0]?.[0]?.length ?? channels[0]?.length ?? 128;
      this.analysis.push(channels, frames, (analysis) => {
        this.peak = Math.max(this.peak, analysis.onsetStrength);
        if (this.inFlight) return;
        this.inFlight = true;
        this.port.postMessage({
          generation: this.generation,
          waveform: analysis.waveform,
          spectrum: analysis.spectrum,
          sampleRate: analysis.sampleRate,
          level: analysis.level,
          beatCount: analysis.beatCount,
          onsetCount: analysis.onsetCount,
          onsetStrength: this.peak,
        });
        this.peak = 0;
      });
      // Outputs stay silent: analysing the monitor signal must not double it.
      return true;
    }
  }
  registerProcessor("visript-audio-detect", VisriptAudioDetector);
}
