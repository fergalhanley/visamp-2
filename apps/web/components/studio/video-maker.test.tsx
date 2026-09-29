import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VideoMaker } from "./video-maker";
import { emptyVideo, type VideoDocument } from "@/lib/videos/model";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/sets/client", () => ({ request: mocks.request }));
let stored: VideoDocument;
const items = [
  {
    media: {
      id: "track",
      kind: "audio",
      source: "hosted",
      title: "My song",
      attribution: "Artist",
      durationMs: 90000,
    },
  },
  {
    media: {
      id: "visual",
      kind: "visual",
      source: "visual",
      title: "Paid visual",
      attribution: "Creator",
    },
    distribution: "product",
    priceCredits: 5,
  },
];
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  stored = {
    id: "video",
    title: "Draft",
    content: emptyVideo(),
    updatedAt: "2026-09-29T00:00:00Z",
    status: "draft",
    distributionState: {},
    scheduleState: {},
  };
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async (url: string, method?: string, input?: typeof stored) => {
      if (url.endsWith("catalogue")) return { items };
      if (method === "PUT")
        stored = {
          ...stored,
          title: input!.title,
          content: input!.content,
          updatedAt: "2026-09-29T00:01:00Z",
        };
      return { video: stored };
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("authors and reopens a Video using the real shared timeline", async () => {
  const onSaved = vi.fn(),
    onDirty = vi.fn();
  const view = render(
    <VideoMaker id="video" onDirty={onDirty} onSaved={onSaved} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Add My song" }));
  fireEvent.click(screen.getByRole("button", { name: "Add Paid visual" }));
  expect(screen.getByRole("button", { name: "My song clip" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Paid visual clip" })).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Duration (seconds)"), {
    target: { value: "15" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save video" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(stored.content.visualClips[0]).toMatchObject({
    durationMs: 15000,
    paramValues: {},
  });
  expect(stored.content.audioClips[0]!.media.source).toBe("hosted");
  expect(
    mocks.request.mock.calls.some(([url]) =>
      String(url).startsWith("/api/sets"),
    ),
  ).toBe(false);
  view.unmount();
  render(<VideoMaker id="video" onDirty={onDirty} onSaved={onSaved} />);
  expect(
    await screen.findByRole("button", { name: "Paid visual clip" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Paid visual clip" }));
  expect(
    (screen.getByLabelText("Duration (seconds)") as HTMLInputElement).value,
  ).toBe("15");
});
it("retains edits after save failure and supports undo/redo and retry", async () => {
  render(<VideoMaker id="video" onDirty={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Add My song" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo" }));
  expect(screen.queryByRole("button", { name: "My song clip" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Redo" }));
  mocks.request.mockRejectedValueOnce(
    new Error("This video changed in another window."),
  );
  fireEvent.click(screen.getByRole("button", { name: "Save video" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This video changed in another window.",
  );
  expect(screen.getByRole("button", { name: "My song clip" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save video" }));
  await waitFor(() => expect(stored.content.audioClips).toHaveLength(1));
});
