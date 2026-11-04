import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultModulationConfig } from "@visamp/player";
import { LfoPanel, waveformPath } from "./lfo-panel";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("LFO controls", () => {
  it("offers a four-oscillator bank from an empty visualisation", () => {
    const onChange = vi.fn();
    render(<LfoPanel config={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Add LFOs" }));
    expect(onChange).toHaveBeenCalledWith(defaultModulationConfig());
    expect(onChange.mock.calls[0]![0].lfos).toHaveLength(4);
  });
  it("changes waveform and enable without mutating the original bank", () => {
    const config = defaultModulationConfig();
    const onChange = vi.fn();
    render(<LfoPanel config={config} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Waveform"), { target: { value: "triangle" } });
    expect(onChange.mock.calls[0]![0].lfos[0].waveform).toBe("triangle");
    expect(config.lfos[0]!.waveform).toBe("sine");
    fireEvent.click(screen.getByLabelText("Enable selected LFO"));
    expect(onChange.mock.calls[1]![0].lfos[0].enabled).toBe(true);
  });
  it("previews waveforms with deterministic geometry", () => {
    const lfo = defaultModulationConfig().lfos[0]!;
    expect(waveformPath(lfo, 120, 4)).toBe(waveformPath(lfo, 120, 4));
    expect(waveformPath({ ...lfo, waveform: "triangle" }, 120, 4))
      .not.toBe(waveformPath(lfo, 120, 4));
  });
});
