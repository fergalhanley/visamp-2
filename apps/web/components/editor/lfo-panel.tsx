"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultModulationConfig,
  evaluateLfo,
  validateModulation,
  type LfoConfig,
  type LfoWaveform,
  type ModulationConfig,
} from "@visamp/player";

const CYCLES = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16];
const WAVEFORMS: { id: LfoWaveform; label: string }[] = [
  { id: "sine", label: "Sine" },
  { id: "triangle", label: "Triangle" },
  { id: "square", label: "Square" },
  { id: "saw-up", label: "Saw up" },
  { id: "saw-down", label: "Saw down" },
  { id: "sample-hold", label: "Stepped random" },
];

interface Props {
  config: ModulationConfig | null;
  onChange: (value: ModulationConfig | null) => void;
  disabled?: boolean;
}

export function waveformPath(lfo: LfoConfig, bpm: number, beatsPerBar: number): string {
  return Array.from({ length: 97 }, (_, index) => {
    const cyclePosition = index / 96;
    // Evaluate a single full cycle with the same host evaluator as the engine.
    const timeMs = cyclePosition * lfo.barsPerCycle * beatsPerBar * 60_000 / bpm;
    const sample = evaluateLfo({ ...lfo, enabled: true }, timeMs, bpm, beatsPerBar);
    const unit = lfo.polarity === "bipolar" ? (sample + 1) / 2 : sample;
    return `${index === 0 ? "M" : "L"}${(cyclePosition * 256).toFixed(1)},${(58 - 52 * unit).toFixed(1)}`;
  }).join(" ");
}

export function LfoPanel({ config, onChange, disabled = false }: Props) {
  const [selected, setSelected] = useState(0);
  const [previewTime, setPreviewTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!config) return;
    let frame = 0;
    let last = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 100) return;
      last = now;
      setPreviewTime(now);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [config]);

  const bank = config ?? defaultModulationConfig();
  const lfo = bank.lfos[Math.min(selected, bank.lfos.length - 1)]!;
  const path = useMemo(
    () => waveformPath(lfo, bank.bpm, bank.beatsPerBar),
    [lfo, bank.bpm, bank.beatsPerBar],
  );
  const output = useMemo(
    () => evaluateLfo(lfo, previewTime, bank.bpm, bank.beatsPerBar),
    [lfo, bank.bpm, bank.beatsPerBar, previewTime],
  );

  const change = (next: ModulationConfig) => {
    try {
      validateModulation(next);
      setError(null);
      onChange(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid modulation");
    }
  };
  const update = (patch: Partial<LfoConfig>) => {
    change({
      ...bank,
      lfos: bank.lfos.map((item, index) => index === selected ? { ...item, ...patch } : item),
    });
  };
  const field = "w-full rounded border bg-background px-1.5 py-1 text-xs disabled:opacity-50";
  return (
    <section aria-label="LFO modulation" className="flex min-h-0 w-72 shrink-0 flex-col border-l">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs font-semibold">
        <span>Modulation</span>
        {config ? (
          <button type="button" disabled={disabled} onClick={() => onChange(null)}
            className="text-muted-foreground underline disabled:opacity-50">Clear all</button>
        ) : (
          <button type="button" disabled={disabled} onClick={() => onChange(defaultModulationConfig())}
            className="text-emerald-400 underline disabled:opacity-50">Add LFOs</button>
        )}
      </div>
      {!config ? (
        <p className="p-3 text-xs text-muted-foreground">No modulation. Add a bank of four LFOs to automate numeric properties without editing Viscript.</p>
      ) : (
        <div className="min-h-0 space-y-3 overflow-y-auto p-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <label>BPM
              <input aria-label="Modulation BPM" type="number" min="1" max="999" step="1" disabled={disabled}
                value={config.bpm} className={field}
                onChange={(event) => change({ ...config, bpm: Number(event.target.value) })} />
            </label>
            <label>Beats/bar
              <input aria-label="Beats per bar" type="number" min="1" max="16" step="1" disabled={disabled}
                value={config.beatsPerBar} className={field}
                onChange={(event) => change({ ...config, beatsPerBar: Number(event.target.value) })} />
            </label>
          </div>
          <div role="tablist" aria-label="Choose LFO" className="grid grid-cols-4 gap-1">
            {config.lfos.map((item, index) => (
              <button key={item.id} type="button" role="tab" aria-selected={selected === index}
                onClick={() => setSelected(index)}
                className={`rounded border px-1 py-1.5 ${selected === index ? "bg-foreground/15 text-foreground" : "text-muted-foreground"}`}>
                {index + 1}{item.enabled ? " ●" : ""}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            <input aria-label="Enable selected LFO" type="checkbox" checked={lfo.enabled} disabled={disabled}
              onChange={(event) => update({ enabled: event.target.checked })} />
            Enable LFO {selected + 1}
          </label>
          <label className="block">Waveform
            <select aria-label="Waveform" className={field} disabled={disabled} value={lfo.waveform}
              onChange={(event) => update({ waveform: event.target.value as LfoWaveform })}>
              {WAVEFORMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <div className="rounded border bg-black/30 p-1">
            <svg role="img" aria-label="LFO waveform preview" viewBox="0 0 256 64" className="w-full">
              <path d="M0 32H256" stroke="currentColor" strokeOpacity="0.2" fill="none" />
              <path d={path} stroke="#5eead4" strokeWidth="1.5" fill="none" />
            </svg>
            <p className="text-right font-mono text-[10px] text-muted-foreground">
              Preview output: {output.toFixed(2)}
            </p>
          </div>
          <label className="block">Cycle length
            <select aria-label="Bars per cycle" className={field} disabled={disabled} value={lfo.barsPerCycle}
              onChange={(event) => update({ barsPerCycle: Number(event.target.value) })}>
              {CYCLES.map((bars) => <option key={bars} value={bars}>{bars} bar{bars === 1 ? "" : "s"}</option>)}
            </select>
          </label>
          <label className="block">Phase ({lfo.phase.toFixed(2)} cycles)
            <input aria-label="LFO phase" type="range" min="0" max="1" step="0.01"
              value={lfo.phase} disabled={disabled} className="w-full"
              onChange={(event) => update({ phase: Number(event.target.value) })} />
          </label>
          <label className="block">Polarity
            <select aria-label="LFO polarity" className={field} disabled={disabled} value={lfo.polarity}
              onChange={(event) => update({ polarity: event.target.value as LfoConfig["polarity"] })}>
              <option value="bipolar">Bipolar (-1 to 1)</option>
              <option value="unipolar">Unipolar (0 to 1)</option>
            </select>
          </label>
          {lfo.waveform === "sample-hold" && (
            <label className="block">Random seed
              <input aria-label="Random seed" type="number" min="0" max="4294967295" step="1"
                value={lfo.seed} className={field} disabled={disabled}
                onChange={(event) => update({ seed: Number(event.target.value) })} />
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">
            Routes are assigned in the Properties tab. Preview output uses a display clock; the renderer uses its own deterministic timeline.
          </p>
          {error && <p role="alert" className="text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
