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
  }: {
    visualisation: { source: string } | null;
    canEdit: boolean;
  }) => (
    <div data-testid="editor" data-editable={canEdit}>
      {visualisation?.source ?? "empty"}
    </div>
  ),
}));
import { EditorDocument } from "./editor-document";
afterEach(() => {
  cleanup();
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
