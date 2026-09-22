import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState } from "react";
import { SetPlayback, SetProgress } from "./set-playback";
import { emptySet, type Clip } from "@/lib/sets/model";
import { SetTransport } from "@/lib/sets/transport";
import { schedule } from "@/lib/sets/scheduler";
import type { Performance } from "./performance-view";
import type { Command } from "@/lib/sets/protocol";
const clip = (
  id: string,
  kind: "audio" | "visual",
  startMs: number,
  durationMs: number,
  sourceOffsetMs = 0,
): Clip => ({
  id,
  media: {
    id,
    kind,
    source: kind === "audio" ? "hosted" : "visual",
    title: id,
    attribution: "Artist",
  },
  startMs,
  durationMs,
  sourceOffsetMs,
  fadeInMs: 0,
  fadeOutMs: 0,
});
const set = {
  ...emptySet(),
  name: "Evening set",
  audioClips: [
    clip("Track one", "audio", 0, 10000, 3000),
    clip("Track two", "audio", 10000, 10000, 5000),
  ],
  visualClips: [
    clip("First visual", "visual", 0, 5000),
    clip("Second visual", "visual", 5000, 15000),
  ],
};
afterEach(cleanup);
it("places both clip lanes proportionally and supports exact keyboard seeking", () => {
  const onSeek = vi.fn();
  const { container } = render(
    <SetProgress set={set} positionMs={10000} onSeek={onSeek} />,
  );
  const visual = container.querySelector<HTMLElement>(
    '[data-clip-id="Second visual"]',
  )!;
  expect(visual.style.left).toBe("25%");
  expect(visual.style.width).toBe("75%");
  expect(
    container.querySelector<HTMLElement>("[data-playhead]")!.style.left,
  ).toBe("50%");
  fireEvent.keyDown(screen.getByRole("slider"), {
    key: "ArrowRight",
    shiftKey: true,
  });
  expect(onSeek).toHaveBeenLastCalledWith(20000);
  fireEvent.keyDown(screen.getByRole("slider"), { key: "Home" });
  expect(onSeek).toHaveBeenLastCalledWith(0);
});
it("pointer seek selects the exact time in either lane and clamps outside bounds", () => {
  const onSeek = vi.fn();
  render(<SetProgress set={set} positionMs={0} onSeek={onSeek} />);
  const slider = screen.getByRole("slider");
  slider.getBoundingClientRect = () => ({ left: 100, width: 400 }) as DOMRect;
  slider.setPointerCapture = vi.fn();
  slider.hasPointerCapture = () => true;
  slider.releasePointerCapture = vi.fn();
  // jsdom does not provide PointerEvent; MouseEvent carries the coordinates.
  fireEvent(
    slider,
    new MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 350 }),
  );
  expect(onSeek).toHaveBeenLastCalledWith(12500);
  fireEvent(
    slider,
    new MouseEvent("pointermove", { bubbles: true, clientX: 700 }),
  );
  expect(onSeek).toHaveBeenLastCalledWith(20000);
});
it("seeks a running set into the correct visual and audio source position without pausing", () => {
  const t = new SetTransport(() => 0);
  t.load(set);
  t.play();
  const commands: Command[] = [];
  function Harness() {
    const [state, update] = useState(t.snapshot());
    const send = (c: Command) => {
      commands.push(c);
      if (c.action === "seek") t.seek(Number(c.value));
      if (c.action === "pause") t.pause();
      update(t.snapshot());
    };
    const p = {
      state,
      send,
      status: "Embedded",
      override: vi.fn(),
    } as unknown as Performance;
    return (
      <SetPlayback performance={p} disabled={false} onPlay={() => t.play()} />
    );
  }
  render(<Harness />);
  fireEvent.change(
    screen.getByRole("slider", { name: "Current set track position" }),
    { target: { value: "7000" } },
  );
  expect(t.state.positionMs).toBe(7000);
  expect(schedule(set, 7000).audio[0]!.sourceMs).toBe(10000);
  expect(schedule(set, 7000).visual[0]!.clip.id).toBe("Second visual");
  expect(t.state.playing).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next set track" }));
  expect(t.state.positionMs).toBe(10000);
  expect(schedule(set, 10000).audio[0]!.sourceMs).toBe(5000);
  fireEvent.keyDown(screen.getByRole("slider", { name: "Set progress" }), {
    key: "ArrowRight",
  });
  expect(commands.at(-1)).toEqual({ action: "seek", value: 11000 });
  expect(schedule(set, 11000).audio[0]!.sourceMs).toBe(6000);
  fireEvent.click(screen.getByRole("button", { name: "Pause set" }));
  fireEvent.keyDown(screen.getByRole("slider", { name: "Set progress" }), {
    key: "Home",
  });
  expect(t.state.playing).toBe(false);
  expect(t.state.positionMs).toBe(0);
});
it("blocks seeking and playback for invalid or absent sets", () => {
  const t = new SetTransport(() => 0);
  t.load(set);
  const send = vi.fn();
  render(
    <SetPlayback
      performance={
        { state: t.state, send, status: "Embedded" } as unknown as Performance
      }
      disabled
      onPlay={vi.fn()}
    />,
  );
  fireEvent.keyDown(screen.getByRole("slider", { name: "Set progress" }), {
    key: "ArrowRight",
  });
  expect(send).not.toHaveBeenCalled();
  expect(
    (screen.getByRole("button", { name: "Play set" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("timeline navigation clears freeplay overrides before seeking the assigned programme", () => {
  const t = new SetTransport(() => 0);
  t.load(set);
  t.override("audio", set.audioClips[0]!.media);
  t.override("visual", set.visualClips[0]!.media);
  const override = vi.fn(),
    send = vi.fn();
  render(
    <SetPlayback
      performance={
        {
          state: t.state,
          send,
          override,
          status: "Embedded",
        } as unknown as Performance
      }
      disabled={false}
      onPlay={vi.fn()}
    />,
  );
  fireEvent.keyDown(screen.getByRole("slider", { name: "Set progress" }), {
    key: "ArrowRight",
  });
  expect(override.mock.calls).toEqual([
    ["audio", null],
    ["visual", null],
  ]);
  expect(send).toHaveBeenCalledWith({ action: "seek", value: 1000 });
});
