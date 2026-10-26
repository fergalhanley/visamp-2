import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { defaultModulationConfig } from "@visamp/player";
import { PropertiesInspector } from "./properties-inspector";

vi.mock("@/hooks/use-fps", () => ({ useFps: () => 60 }));
afterEach(cleanup);

describe("property modulation assignments", () => {
  const properties = [
    { name: "rotation", type: "float", value: "0" },
    { name: "label", type: "string", value: "demo" },
  ];
  it("offers routing only on numeric properties", () => {
    render(<PropertiesInspector properties={properties} modulation={defaultModulationConfig()} />);
    expect(screen.getByRole("button", { name: "Modulate rotation" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Modulate label" })).toBeNull();
  });
  it("creates an enabled route and enables its source oscillator", () => {
    const onModulationChange = vi.fn();
    render(<PropertiesInspector properties={properties} modulation={defaultModulationConfig()}
      onModulationChange={onModulationChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Modulate rotation" }));
    fireEvent.change(screen.getByLabelText("LFO for rotation"), { target: { value: "lfo-1" } });
    const bank = onModulationChange.mock.calls[0]![0];
    expect(bank.routes).toEqual([
      { lfoId: "lfo-1", property: "rotation", min: -1, max: 1, enabled: true },
    ]);
    expect(bank.lfos[0].enabled).toBe(true);
  });
});
