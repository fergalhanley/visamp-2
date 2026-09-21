import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PerformanceView, type Performance } from "./performance-view";
import { useFreeplay, nextMedia } from "./use-freeplay";
import { SetTransport } from "@/lib/sets/transport";
import { parseCommand } from "@/lib/sets/protocol";
import type { MediaRef } from "@/lib/sets/model";
afterEach(cleanup);
const audio: MediaRef = { id: "a", kind: "audio", source: "hosted", title: "Song", attribution: "Artist", durationMs: 10000 };
const visual: MediaRef = { id: "v", kind: "visual", source: "visual", title: "Visual", attribution: "Creator" };
function performance(): Performance {
  return {
    state: new SetTransport(() => 0).snapshot(), embedded: true, embeddedId: "one", session: "session",
    attachFrame: vi.fn(), popout: vi.fn(), restart: vi.fn(), send: vi.fn(), override: vi.fn().mockResolvedValue(undefined),
    status: "Embedded", errors: [], input: vi.fn(), load: vi.fn(), replaceSet: vi.fn(),
  };
}
it("swaps output for input capture only after pop-out connects and restores its overlay on recovery", () => {
  const p = performance();
  const props = { performance: p, onPopout: true, poppedOut: <button>Input Controller</button>, controls: <p>Freeplay transport</p> };
  const { rerender } = render(<PerformanceView {...props} />);
  expect(screen.getByTitle("Set output")).toBeTruthy();
  expect(screen.queryByText("Input Controller")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pop out output" }));
  expect(p.popout).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("Set playhead")).toBeNull();
  rerender(<PerformanceView {...props} performance={{ ...p, embedded: false, status: "Pop-out connected" }} />);
  expect(screen.queryByTitle("Set output")).toBeNull();
  expect(screen.queryByRole("button", { name: "Pop out output" })).toBeNull();
  expect(screen.getByText("Input Controller")).toBeTruthy();
  rerender(<PerformanceView {...props} performance={{ ...p, status: "Pop-out disconnected", embeddedId: "recovered" }} />);
  expect(screen.getByRole("button", { name: "Pop out output" })).toBeTruthy();
  expect(screen.queryByText("Input Controller")).toBeNull();
});
it("seeks live audio without seeking the programme or losing paused state", () => {
  const transport = new SetTransport(() => 0);
  transport.override("audio", audio);
  transport.state.positionMs = 4500;
  transport.seekAudio(7000);
  expect(transport.state.audioOverride?.positionMs).toBe(7000);
  expect(transport.state.positionMs).toBe(4500);
  expect(transport.state.playing).toBe(false);
  transport.seekAudio(99999);
  expect(transport.state.audioOverride?.positionMs).toBe(10000);
  expect(parseCommand({ action: "seek-audio", value: 7000 })).toBeTruthy();
  expect(parseCommand({ action: "seek-audio", value: NaN })).toBeNull();
});
it("supports queue next/previous, shuffle without repeats, and empty queues", () => {
  const items = [audio, { ...audio, id: "b" }, { ...audio, id: "c" }];
  expect(nextMedia(items, "a", 1, false)?.id).toBe("b");
  expect(nextMedia(items, "a", -1, false)?.id).toBe("c");
  expect(nextMedia(items, "a", 1, true)?.id).not.toBe("a");
  expect(nextMedia([], undefined, 1, false)).toBeUndefined();
});
it("advances audio and visuals per track, with manual mode keeping the visual", async () => {
  const p = performance();
  const { result, rerender } = renderHook((p) => useFreeplay(p, true), { initialProps: p });
  await act(async () => {
    await result.current.select("audio", audio, [audio, { ...audio, id: "b" }]);
    await result.current.select("visual", visual, [visual, { ...visual, id: "w" }]);
  });
  vi.mocked(p.override).mockClear();
  rerender({ ...p, state: { ...p.state, playing: true, audioOverride: { media: audio, positionMs: 10000 }, visualOverride: { media: visual, positionMs: 10000 } } });
  expect(p.override).toHaveBeenCalledWith("audio", expect.objectContaining({ id: "b" }));
  expect(p.override).toHaveBeenCalledWith("visual", expect.objectContaining({ id: "w" }));
  act(() => result.current.controller.setMode("manual"));
  vi.mocked(p.override).mockClear();
  act(() => result.current.controller.skip(1));
  expect(p.override).toHaveBeenCalledWith("audio", expect.objectContaining({ id: "b" }));
  expect(p.override).not.toHaveBeenCalledWith("visual", expect.anything());
  act(() => result.current.controller.seek(2));
  expect(p.send).toHaveBeenCalledWith({ action: "seek-audio", value: 2000 });
});
it("uses visual playback time for Timed and does not retry the same failed boundary", async () => {
  const p = performance();
  const { result, rerender } = renderHook((p) => useFreeplay(p, true), { initialProps: p });
  await act(() => result.current.select("visual", visual, [visual, { ...visual, id: "w" }]));
  act(() => result.current.controller.setMode("time-interval"));
  vi.mocked(p.override).mockClear();
  const running = { ...p, state: { ...p.state, playing: true, visualOverride: { media: visual, positionMs: 31000 } } };
  rerender(running);
  expect(p.override).toHaveBeenCalledTimes(1);
  expect(p.override).toHaveBeenCalledWith("visual", expect.objectContaining({ id: "w" }));
  rerender({ ...running });
  expect(p.override).toHaveBeenCalledTimes(1);
});
