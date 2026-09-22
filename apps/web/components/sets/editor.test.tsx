import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptySet, type Clip, type MediaRef } from "@/lib/sets/model";
import type { usePerformance } from "./use-performance";
import { SetTransport } from "@/lib/sets/transport";
const mock = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  replaceSet: vi.fn(),
  send: vi.fn(),
  performance: {} as Pick<
    ReturnType<typeof usePerformance>,
    "state" | "load" | "replaceSet" | "send" | "override"
  >,
}));
vi.mock("@/components/chrome/top-bar", () => ({ TopBar: () => null }));
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
vi.mock("@/lib/sets/client", () => ({
  request: mock.request,
  resolveSet: vi.fn(),
}));
vi.mock("./use-performance", () => ({
  usePerformance: () => mock.performance,
}));
vi.mock("./performance-view", () => ({ PerformanceView: () => null }));
vi.mock("./catalogue", () => ({
  DRAG_MEDIA: "application/visamp",
  Catalogue: ({ onAdd }: { onAdd: (media: MediaRef) => void }) => (
    <button
      onClick={() =>
        onAdd({
          id: "new-vis",
          kind: "visual",
          source: "visual",
          title: "New visual",
          attribution: "Creator",
        })
      }
    >
      Add visual
    </button>
  ),
}));
import { SetEditor } from "./editor";
const clip = (kind: "audio" | "visual"): Clip => ({
  id: kind,
  media: {
    id: kind,
    kind,
    source: kind === "audio" ? "hosted" : "visual",
    title: kind,
    attribution: "Creator",
    durationMs: 180000,
  },
  startMs: 0,
  durationMs: 60000,
  sourceOffsetMs: kind === "audio" ? 5000 : 0,
  fadeInMs: 0,
  fadeOutMs: 0,
});
let transport: SetTransport;
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  transport = new SetTransport(() => 0);
  const set = {
    ...emptySet(),
    audioClips: [clip("audio")],
    visualClips: [clip("visual")],
  };
  mock.request.mockResolvedValue({ ...set, updatedAt: "2026-09-22" });
  mock.load.mockImplementation(async (set) => {
    transport.load(set);
    return { unavailable: {}, visuals: {} };
  });
  mock.replaceSet.mockImplementation((set) => {
    const time = transport.time();
    transport.load(set);
    transport.seek(time);
  });
  mock.send.mockImplementation((command) => {
    if (command.action === "seek") transport.seek(command.value);
    if (command.action === "play") transport.play();
    if (command.action === "pause") transport.pause();
  });
  mock.performance = {
    get state() {
      return transport.state;
    },
    load: mock.load,
    replaceSet: mock.replaceSet,
    send: mock.send,
    override: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  render(<SetEditor id="test" />);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Play set" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  // Allow reference resolution to finish before interacting.
  await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Play set" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
}
it("seeks and plays without resolving media again, and Space resumes from the marker", async () => {
  await open();
  const ruler = screen.getByRole("slider", { name: "Timeline position" });
  fireEvent.keyDown(ruler, { key: "ArrowRight", code: "ArrowRight" });
  expect(transport.state.positionMs).toBe(1000);
  expect(transport.state.playing).toBe(true);
  fireEvent.keyDown(ruler, { key: " ", code: "Space" });
  expect(transport.state.playing).toBe(false);
  fireEvent.keyDown(ruler, { key: " ", code: "Space" });
  expect(transport.state.playing).toBe(true);
  expect(transport.state.positionMs).toBe(1000);
  expect(mock.load).toHaveBeenCalledTimes(2);
});
it.each(["audio", "visual"])(
  "copies and pastes a selected %s at the marker with undo/redo",
  async (kind) => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: `${kind} clip` }));
    fireEvent.keyDown(window, { code: "KeyC", ctrlKey: true });
    transport.seek(60000);
    fireEvent.keyDown(window, { code: "KeyV", ctrlKey: true });
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: `${kind} clip` }),
      ).toHaveLength(2),
    );
    await waitFor(() =>
      expect(
        transport.state.set[kind === "audio" ? "audioClips" : "visualClips"],
      ).toHaveLength(2),
    );
    const pasted =
      transport.state.set[kind === "audio" ? "audioClips" : "visualClips"][1]!;
    expect(pasted).toMatchObject({
      startMs: 60000,
      durationMs: 60000,
      sourceOffsetMs: kind === "audio" ? 5000 : 0,
    });
    expect(pasted.id).not.toBe(kind);
    fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });
    expect(
      screen.getAllByRole("button", { name: `${kind} clip` }),
    ).toHaveLength(1);
    fireEvent.keyDown(window, { code: "KeyY", ctrlKey: true });
    expect(
      screen.getAllByRole("button", { name: `${kind} clip` }),
    ).toHaveLength(2);
  },
);
it("adds a 30-second visual regardless of the audio programme length", async () => {
  mock.request.mockResolvedValue({
    ...emptySet(),
    audioClips: [{ ...clip("audio"), durationMs: 120000 }],
    visualClips: [clip("visual")],
    updatedAt: "2026-09-22",
  });
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Add visual" }));
  await waitFor(() => expect(transport.state.set.visualClips).toHaveLength(2));
  expect(transport.state.set.visualClips[1]!.durationMs).toBe(30000);
});

it("opens properties from double-click or toolbar and preserves them through save, copy and undo", async () => {
  await open();
  expect(
    (
      screen.getByRole("button", {
        name: "Clip properties",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.doubleClick(screen.getByRole("button", { name: "visual clip" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByLabelText("Show title"));
  fireEvent.change(screen.getByLabelText("Start (seconds)"), {
    target: { value: "1.5" },
  });
  // Editor transport/history shortcuts must not run while the dialog is open.
  fireEvent.keyDown(window, { code: "Space" });
  expect(transport.state.playing).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() =>
    expect(transport.state.set.visualClips[0]!.titleProperties?.startMs).toBe(
      1500,
    ),
  );
  await waitFor(() =>
    expect(mock.request).toHaveBeenCalledWith(
      "/api/sets/test",
      "PUT",
      expect.objectContaining({
        content: expect.objectContaining({
          visualClips: expect.arrayContaining([
            expect.objectContaining({
              titleProperties: expect.objectContaining({
                enabled: true,
                startMs: 1500,
              }),
            }),
          ]),
        }),
      }),
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clip properties" }));
  expect(
    (screen.getByLabelText("Start (seconds)") as HTMLInputElement).value,
  ).toBe("1.5");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.keyDown(window, { code: "KeyC", ctrlKey: true });
  transport.seek(60000);
  fireEvent.keyDown(window, { code: "KeyV", ctrlKey: true });
  await waitFor(() => expect(transport.state.set.visualClips).toHaveLength(2));
  expect(transport.state.set.visualClips[1]!.titleProperties).toEqual(
    transport.state.set.visualClips[0]!.titleProperties,
  );
  fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });
  fireEvent.keyDown(window, { code: "KeyZ", ctrlKey: true });
  await waitFor(() =>
    expect(transport.state.set.visualClips[0]!.titleProperties).toBeUndefined(),
  );
});
