import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Timeline } from "./timeline";
import {
  emptySet,
  parseSet,
  type Clip,
  type SetContent,
} from "@/lib/sets/model";
import { SetTransport } from "@/lib/sets/transport";
import { parseState } from "@/lib/sets/protocol";
import { schedule } from "@/lib/sets/scheduler";
vi.mock("./catalogue", () => ({ DRAG_MEDIA: "application/visamp" }));
const clip = (id: string, startMs: number, durationMs: number): Clip => ({
  id,
  media: {
    id,
    kind: "visual",
    source: "visual",
    title: id,
    attribution: "Creator",
  },
  startMs,
  durationMs,
  sourceOffsetMs: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
});
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("PointerEvent", MouseEvent);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("resizes to a fractional playhead, saves valid milliseconds and hands off to the next visual", () => {
  const set = {
    ...emptySet(),
    visualClips: [clip("Spectrohex", 0, 10000), clip("Next", 20000, 30000)],
  };
  const change = vi.fn<(set: SetContent) => void>();
  render(
    <Timeline
      set={set}
      onChange={change}
      onAdd={vi.fn()}
      position={30000.456}
      onSeek={vi.fn()}
      selected={null}
      onSelect={vi.fn()}
      unavailable={{}}
    />,
  );
  const trim = screen
    .getByRole("button", { name: "Spectrohex clip" })
    .querySelector(".set-trim.right")!;
  fireEvent.pointerDown(trim, { clientX: 100 });
  fireEvent.pointerMove(trim, { clientX: 100 + 20000.456 / 180 });
  fireEvent.pointerUp(trim);
  const edited = change.mock.calls[0]![0];
  expect(edited.visualClips[0]!.durationMs).toBe(30000);
  expect(edited.visualClips[0]!.fadeOutMs).toBe(10000);
  expect(() => parseSet(edited)).not.toThrow();
  const operator = new SetTransport(() => 0);
  operator.load(edited);
  const snapshot = parseState(operator.snapshot());
  expect(snapshot).not.toBeNull();
  const output = new SetTransport(() => 0);
  output.restore(snapshot!);
  expect(
    schedule(output.state.set, 29999).visual.map((v) => v.clip.id),
  ).toContain("Spectrohex");
  expect(
    schedule(output.state.set, 30000).visual.map((v) => v.clip.id),
  ).toEqual(["Next"]);
});
it("left trim snaps only the moving edge, not the fixed right edge", () => {
  const set = { ...emptySet(), visualClips: [clip("Visual", 10000, 30000)] };
  const change = vi.fn();
  render(
    <Timeline
      set={set}
      onChange={change}
      onAdd={vi.fn()}
      position={42000}
      onSeek={vi.fn()}
      selected={null}
      onSelect={vi.fn()}
      unavailable={{}}
    />,
  );
  const trim = screen
    .getByRole("button", { name: "Visual clip" })
    .querySelector(".set-trim.left")!;
  fireEvent.pointerDown(trim, { clientX: 100 });
  fireEvent.pointerMove(trim, { clientX: 100 + 1000 / 180 });
  fireEvent.pointerUp(trim);
  expect(change.mock.calls[0]![0].visualClips[0]).toMatchObject({
    startMs: 11000,
    durationMs: 29000,
  });
});
