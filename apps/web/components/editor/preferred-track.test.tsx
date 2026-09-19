import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreferredTrack } from "./preferred-track";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("selects an available hosted track and permits clearing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        tracks: [{ id: "track", title: "Song", artist: "Act" }],
      }),
    ),
  );
  const change = vi.fn();
  const view = render(
    <PreferredTrack value={null} onChange={change} disabled={false} />,
  );
  await screen.findByRole("option", { name: "Song — Act" });
  fireEvent.change(screen.getByLabelText("Preferred track"), {
    target: { value: "track" },
  });
  expect(change).toHaveBeenCalledWith("track");
  view.rerender(
    <PreferredTrack value="track" onChange={change} disabled={false} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear track" }));
  expect(change).toHaveBeenCalledWith(null);
});
it("preserves an unavailable saved choice and lets the owner clear it", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ tracks: [] })),
  );
  const change = vi.fn();
  render(
    <PreferredTrack value="withdrawn" onChange={change} disabled={false} />,
  );
  await screen.findByRole("option", { name: "Selected track unavailable" });
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear track" }));
  expect(change).toHaveBeenCalledWith(null);
});
