import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "owner" }, loading: false }),
}));
vi.mock("@/components/auth/account-menu", () => ({ AccountMenu: () => null }));
vi.mock("./track-preview", () => ({ TrackPreview: () => null }));
vi.mock("@/lib/hosted-audio/read-tags", () => ({
  readTrackTags: async () => ({}),
  titleFromFileName: () => "Track",
}));
vi.mock("@/lib/hosted-audio/upload-queue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hosted-audio/upload-queue")>()),
  createFileHasher: () => async () => "a".repeat(64),
}));
import { UploadForm } from "./upload-form";
const first = { id: "first", name: "First Act", slug: "first-act" };
const second = { id: "second", name: "Second Act", slug: "second-act" };
const data = {
  artists: [first],
  remainingToday: 20,
  uploads: [],
  admin: false,
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("always shows a dropdown and selects a newly created artist", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) =>
      Response.json(url === "/api/uploads/artist" ? { artist: second } : data),
    ),
  );
  render(<UploadForm />);
  const select = await screen.findByRole("combobox", { name: "Artist" });
  expect((select as HTMLSelectElement).value).toBe("first");
  fireEvent.click(screen.getByRole("button", { name: "Add artist" }));
  fireEvent.change(screen.getByLabelText("Artist name"), {
    target: { value: "Second Act" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Create artist profile" }),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("combobox", { name: "Artist" }) as HTMLSelectElement)
        .value,
    ).toBe("second"),
  );
  expect(screen.getAllByRole("option")).toHaveLength(2);
});
it("keeps a failed upload attached to its original artist after selection changes", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      if (options?.method === "POST") {
        requests.push(JSON.parse(options.body).artistId);
        return Response.json(
          { error: "Temporarily unavailable" },
          { status: 503 },
        );
      }
      return Response.json({ ...data, artists: [first, second] });
    }),
  );
  const { container } = render(<UploadForm />);
  await screen.findByRole("combobox", { name: "Artist" });
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["mp3"], "track.mp3", { type: "audio/mpeg" })] },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Upload track" }));
  await screen.findByRole("button", { name: "Retry" });
  fireEvent.change(screen.getByRole("combobox", { name: "Artist" }), {
    target: { value: "second" },
  });
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(requests).toEqual(["first", "first"]));
});

it("saves album and artwork and retries failed artwork without transferring audio again", async () => {
  let attempts = 0;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/uploads" && options?.method === "POST")
      return Response.json({
        status: "uploading",
        url: "https://upload.test/audio",
        contentType: "audio/mpeg",
      });
    if (url.endsWith("/complete"))
      return Response.json({
        status: "completed",
        trackId: "track",
        trackStatus: "live",
      });
    if (url === "/api/my-tracks/track" && options?.method === "POST") {
      attempts++;
      return attempts === 1
        ? Response.json({ error: "Image unavailable" }, { status: 503 })
        : Response.json({ ok: true });
    }
    if (url === "/api/my-tracks/track") return Response.json({ ok: true });
    return Response.json({ ...data, artists: [first, second] });
  });
  const transfers = vi.fn();
  class Transfer {
    upload = {};
    status = 200;
    onload?: () => void;
    onloadend?: () => void;
    open() {}
    setRequestHeader() {}
    abort() {}
    send() {
      transfers();
      queueMicrotask(() => {
        this.onload?.();
        this.onloadend?.();
      });
    }
  }
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("XMLHttpRequest", Transfer);
  const { container } = render(<UploadForm initialArtistId="second" />);
  expect(
    (
      (await screen.findByRole("combobox", {
        name: "Artist",
      })) as HTMLSelectElement
    ).value,
  ).toBe("second");
  fireEvent.change(container.querySelector('input[type="file"]')!, {
    target: { files: [new File(["mp3"], "track.mp3", { type: "audio/mpeg" })] },
  });
  fireEvent.change(screen.getByLabelText("Album for track.mp3"), {
    target: { value: "Night signals" },
  });
  const image = new File(["image"], "cover.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Artwork for track.mp3"), {
    target: { files: [image] },
  });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Upload track" }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  await waitFor(() => expect(attempts).toBe(2));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull(),
  );
  expect(transfers).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/my-tracks/track",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ title: "Track", album: "Night signals" }),
    }),
  );
  expect(fetch).toHaveBeenCalledWith(
    "/api/my-tracks/track",
    expect.objectContaining({ method: "POST", body: image }),
  );
});
