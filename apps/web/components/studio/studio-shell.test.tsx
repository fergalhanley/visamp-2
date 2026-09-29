import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioShell } from "./studio-shell";
import { emptySet } from "@/lib/sets/model";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/sets/client", () => ({ request: mocks.request }));
const set = {
  ...emptySet(),
  id: "set-one",
  name: "Single release",
  ownerId: "owner",
  createdAt: "2026-09-29T00:00:00Z",
  updatedAt: "2026-09-29T00:00:00Z",
};
afterEach(cleanup);
beforeEach(() => {
  mocks.request.mockReset();
});
it("selects the original Set and reopens the selection without creating a Video", async () => {
  const data = {
    sets: [set],
    selections: [] as { setId: string; selectedAt: string }[],
  };
  mocks.request.mockImplementation(async (_url: string, method?: string) => {
    if (method === "POST") {
      const selection = { setId: set.id, selectedAt: set.createdAt };
      data.selections = [selection];
      return { selection };
    }
    return data;
  });
  const view = render(<StudioShell />);
  const select = await screen.findByRole("button", {
    name: "Select for distribution",
  });
  expect(
    screen
      .getByRole("link", { name: "Edit / preview in Set Builder" })
      .getAttribute("href"),
  ).toBe("/sets/set-one/edit");
  expect(
    screen.getByRole("link", { name: "Create a Set" }).getAttribute("href"),
  ).toBe("/sets/new");
  fireEvent.click(select);
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("region", { name: "Selected for distribution" }),
      ).getByText("Single release"),
    ).toBeTruthy(),
  );
  expect(mocks.request).toHaveBeenCalledWith("/api/studio/sets", "POST", {
    setId: "set-one",
  });
  view.unmount();
  render(<StudioShell />);
  expect(await screen.findByText("Awaiting export")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Select for distribution" }),
  ).toBeNull();
  expect(
    mocks.request.mock.calls.every(([url]) => url === "/api/studio/sets"),
  ).toBe(true);
  expect(screen.queryByText("Video Maker")).toBeNull();
});
it("keeps failed selections in the library for retry", async () => {
  mocks.request
    .mockResolvedValueOnce({ sets: [set], selections: [] })
    .mockRejectedValueOnce(new Error("Selection could not be saved"))
    .mockResolvedValueOnce({
      selection: { setId: set.id, selectedAt: set.createdAt },
    });
  render(<StudioShell />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Select for distribution" }),
  );
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Selection could not be saved",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Select for distribution" }),
  );
  expect(await screen.findByText("Awaiting export")).toBeTruthy();
});
it("shows a load failure without claiming the user's library is empty", async () => {
  mocks.request.mockRejectedValue(new Error("Sign in to use sets."));
  render(<StudioShell />);
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Sign in to use sets.",
  );
  expect(screen.queryByText(/Create your first Set/)).toBeNull();
});
