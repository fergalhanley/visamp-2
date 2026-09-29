import type { ComponentProps, ReactNode } from "react";
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
import {
  defaultMasterSettings,
  type Distribution,
} from "@/lib/studio/distributions-model";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/sets/client", () => ({ request: mocks.request }));
// Exercise Studio state separately from Base UI's layout/focus machinery (no
// layout engine in jsdom). The real dropdown is checked in browser verification.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: (props: ComponentProps<"button">) => (
    <button {...props} />
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  DropdownMenuItem: ({ disabled, ...props }: ComponentProps<"button">) => (
    <button
      role="menuitem"
      aria-disabled={disabled}
      disabled={disabled}
      {...props}
    />
  ),
}));

const first = {
  ...emptySet(),
  id: "first",
  name: "Alpha",
  ownerId: "owner",
  createdAt: "2026-09-29T00:00:00Z",
  updatedAt: "2026-09-29T00:00:00Z",
};
const second = {
  ...first,
  id: "second",
  name: "Beta",
  updatedAt: "2026-09-30T00:00:00Z",
};
const makeDistribution = (): Distribution => ({
  id: "master",
  setId: first.id,
  target: "master_download",
  status: "draft",
  settings: defaultMasterSettings(first.name),
  createdAt: first.updatedAt,
  updatedAt: first.updatedAt,
});
let stored: Distribution[];
beforeEach(() => {
  stored = [];
  mocks.request.mockReset();
  mocks.request.mockImplementation(
    async (
      url: string,
      method?: string,
      input?: { settings: Distribution["settings"] },
    ) => {
      if (url === "/api/studio/sets")
        return {
          sets: [first, second],
          selections: [{ setId: first.id, selectedAt: first.updatedAt }],
        };
      if (method === "POST") {
        stored = [makeDistribution()];
        return { distribution: stored[0] };
      }
      if (method === "PUT") {
        stored = [
          {
            ...stored[0]!,
            settings: input!.settings,
            updatedAt: second.updatedAt,
          },
        ];
        return { distribution: stored[0] };
      }
      return { distributions: stored };
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const sets = () => within(screen.getByRole("region", { name: "Set library" }));
async function chooseAlpha() {
  fireEvent.click(await sets().findByRole("button", { name: /Alpha/ }));
}
async function addMaster() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Add distribution" }), {
    key: "ArrowDown",
  });
  fireEvent.click(
    await screen.findByRole("menuitem", {
      name: "Master Downloads",
      hidden: true,
    }),
  );
  await screen.findByLabelText("Filename");
}
it("lists all Sets with search, date/name sorting and status filtering", async () => {
  render(<StudioShell />);
  await sets().findByRole("button", { name: /Alpha/ });
  expect(
    sets()
      .getAllByRole("button")
      .map((item) => item.textContent!.split("00:")[0]),
  ).toEqual(["Beta", "Alpha"]);
  fireEvent.change(screen.getByLabelText("Sort by"), {
    target: { value: "name_asc" },
  });
  expect(sets().getAllByRole("button")[0]!.textContent).toContain("Alpha");
  fireEvent.change(screen.getByLabelText("Status", { selector: "select" }), {
    target: { value: "selected" },
  });
  expect(sets().queryByRole("button", { name: /Beta/ })).toBeNull();
  fireEvent.change(screen.getByLabelText("Status", { selector: "select" }), {
    target: { value: "all" },
  });
  fireEvent.change(screen.getByLabelText("Search Sets"), {
    target: { value: "beta" },
  });
  expect(sets().queryByRole("button", { name: /Alpha/ })).toBeNull();
  expect(sets().getByRole("button", { name: /Beta/ })).toBeTruthy();
});
it("creates and saves a Master setup on the original Set, then reloads it", async () => {
  const view = render(<StudioShell />);
  await chooseAlpha();
  await addMaster();
  expect(mocks.request).toHaveBeenCalledWith(
    "/api/studio/distributions",
    "POST",
    { setId: "first", target: "master_download" },
  );
  expect(
    screen
      .getByRole("link", { name: "Edit / preview in Set Builder" })
      .getAttribute("href"),
  ).toBe("/sets/first/edit");
  fireEvent.change(screen.getByLabelText("Filename"), {
    target: { value: "Release master" },
  });
  fireEvent.change(screen.getByLabelText("Resolution"), {
    target: { value: "720p" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  await waitFor(() =>
    expect(stored[0]!.settings.filename).toBe("Release master"),
  );
  expect(stored[0]!.settings.resolution).toBe("720p");
  view.unmount();
  render(<StudioShell />);
  await chooseAlpha();
  fireEvent.click(
    screen.getByRole("button", { name: /Master Downloads.*720p/ }),
  );
  expect((screen.getByLabelText("Filename") as HTMLInputElement).value).toBe(
    "Release master",
  );
});
it("retains unsaved per-distribution settings across Set switches and failed saves", async () => {
  stored = [makeDistribution()];
  render(<StudioShell />);
  await chooseAlpha();
  fireEvent.click(
    screen.getByRole("button", { name: /Master Downloads.*1080p/ }),
  );
  fireEvent.change(screen.getByLabelText("Filename"), {
    target: { value: "Keep these edits" },
  });
  fireEvent.click(sets().getByRole("button", { name: /Beta/ }));
  expect(screen.queryByLabelText("Filename")).toBeNull();
  fireEvent.click(sets().getByRole("button", { name: /Alpha/ }));
  fireEvent.click(
    screen.getByRole("button", { name: /Master Downloads.*1080p/ }),
  );
  expect((screen.getByLabelText("Filename") as HTMLInputElement).value).toBe(
    "Keep these edits",
  );
  mocks.request.mockRejectedValueOnce(new Error("Changed in another window"));
  fireEvent.click(screen.getByRole("button", { name: "Save settings" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Changed in another window",
  );
  expect((screen.getByLabelText("Filename") as HTMLInputElement).value).toBe(
    "Keep these edits",
  );
});
it("opens the existing Master setup and marks social targets unavailable", async () => {
  stored = [makeDistribution()];
  render(<StudioShell />);
  await chooseAlpha();
  fireEvent.keyDown(screen.getByRole("button", { name: "Add distribution" }), {
    key: "ArrowDown",
  });
  expect(
    (
      await screen.findByRole("menuitem", { name: /YouTube/, hidden: true })
    ).getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("menuitem", { name: "Master Downloads", hidden: true }),
  );
  expect(screen.getByLabelText("Filename")).toBeTruthy();
  expect(mocks.request.mock.calls.some(([, method]) => method === "POST")).toBe(
    false,
  );
});
it("hides a filtered-out Set without displaying another Set's settings", async () => {
  stored = [makeDistribution()];
  render(<StudioShell />);
  await chooseAlpha();
  fireEvent.click(
    screen.getByRole("button", { name: /Master Downloads.*1080p/ }),
  );
  fireEvent.change(screen.getByLabelText("Search Sets"), {
    target: { value: "Beta" },
  });
  expect(screen.queryByLabelText("Filename")).toBeNull();
  expect(
    screen.getByText("Select a Set to see its distributions."),
  ).toBeTruthy();
});
it("reports load failures without claiming an empty library", async () => {
  mocks.request.mockRejectedValue(new Error("Unavailable"));
  render(<StudioShell />);
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Unavailable",
  );
  expect(
    screen.queryByText("Create a Set in Set Builder to get started."),
  ).toBeNull();
});
