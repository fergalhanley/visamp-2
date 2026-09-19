import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("./editor-shell", () => ({
  EditorShell: ({
    visualisation,
    canEdit,
    initialPrompt,
  }: {
    visualisation: { source: string } | null;
    canEdit: boolean;
    initialPrompt?: string;
  }) => (
    <div
      data-testid="editor"
      data-editable={canEdit}
      data-prompt={initialPrompt}
    >
      {visualisation?.source ?? "empty"}
    </div>
  ),
}));
import { EditorDocument } from "./editor-document";
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});
it("waits for a fresh read on every entry and restores saved content after returning", async () => {
  let saved = "old source";
  const fetch = vi.fn(async () =>
    Response.json({ visualisation: { source: saved }, canEdit: true }),
  );
  vi.stubGlobal("fetch", fetch);
  const first = render(<EditorDocument id="vis" />);
  expect(screen.queryByTestId("editor")).toBeNull();
  expect((await screen.findByTestId("editor")).textContent).toBe("old source");
  saved = "latest saved source";
  first.unmount();
  render(<EditorDocument id="vis" />);
  expect(screen.queryByTestId("editor")).toBeNull();
  expect((await screen.findByTestId("editor")).textContent).toBe(
    "latest saved source",
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/editor/vis",
    expect.objectContaining({ cache: "no-store" }),
  );
});
it("never opens a stale editable document when the fresh read fails; supports retry", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ error: "Unavailable" }, { status: 503 }),
    )
    .mockResolvedValueOnce(
      Response.json({ visualisation: null, canEdit: false }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<EditorDocument id="vis" />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByTestId("editor")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect((await screen.findByTestId("editor")).textContent).toBe("empty");
});
it("ignores an old document response after the requested id changes", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(
      Response.json({ visualisation: { source: "second" }, canEdit: false }),
    );
  vi.stubGlobal("fetch", fetch);
  const view = render(<EditorDocument id="first" />);
  view.rerender(<EditorDocument id="second" />);
  expect((await screen.findByTestId("editor")).textContent).toBe("second");
  finish(Response.json({ visualisation: { source: "first" }, canEdit: true }));
  await waitFor(() =>
    expect(screen.getByTestId("editor").textContent).toBe("second"),
  );
});

it("seeds only the creation visit using the saved title and consumes the marker", async () => {
  window.history.replaceState(
    { preserved: true },
    "",
    "/edit/vis#starter-prompt",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        visualisation: { source: "starter", title: "Strobe Velvet Pumpkin" },
        canEdit: true,
      }),
    ),
  );
  const view = render(<EditorDocument id="vis" />);
  expect(
    (await screen.findByTestId("editor")).getAttribute("data-prompt"),
  ).toContain('"Strobe Velvet Pumpkin"');
  expect(window.location.hash).toBe("");
  view.unmount();
  render(<EditorDocument id="vis" />);
  expect(
    (await screen.findByTestId("editor")).getAttribute("data-prompt"),
  ).toBe("");
});
it("preserves the creation marker through a failed load, then seeds on retry", async () => {
  window.history.replaceState(null, "", "/edit/vis#starter-prompt");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ error: "Unavailable" }, { status: 503 }),
      )
      .mockResolvedValueOnce(
        Response.json({
          visualisation: { title: "Prism Silver Fox" },
          canEdit: true,
        }),
      ),
  );
  render(<EditorDocument id="vis" />);
  await screen.findByRole("alert");
  expect(window.location.hash).toBe("#starter-prompt");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(
    (await screen.findByTestId("editor")).getAttribute("data-prompt"),
  ).toContain("Prism Silver Fox");
});
it("never seeds read-only documents even with a creation marker", async () => {
  window.history.replaceState(null, "", "/edit/vis#starter-prompt");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ visualisation: { title: "Existing" }, canEdit: false }),
    ),
  );
  render(<EditorDocument id="vis" />);
  expect(
    (await screen.findByTestId("editor")).getAttribute("data-prompt"),
  ).toBe("");
});
