import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, type MutableRefObject } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
const m = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@visamp/player", () => ({ VisampCanvas: () => null }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "owner" } }),
}));
vi.mock("@/components/auth/sign-in-dialog", () => ({
  SignInDialog: () => null,
}));
vi.mock("@/components/chrome/top-bar", () => ({ TopBar: () => null }));
vi.mock("@/components/chrome/create-vis-button", () => ({
  CreateVisButton: () => null,
}));
vi.mock("@/components/editor/open-vis-dialog", () => ({
  OpenVisDialog: () => null,
}));
vi.mock("@/components/editor/asset-panel", () => ({ AssetPanel: () => null }));
vi.mock("@/components/editor/editor-transport", () => ({
  EditorTransport: () => null,
}));
vi.mock("@/components/editor/properties-inspector", () => ({
  PropertiesInspector: () => null,
}));
vi.mock("@/hooks/use-analyser", () => ({ useAnalyser: () => null }));
vi.mock("@/hooks/use-fullscreen", () => ({
  useFullscreen: () => ({ toggle: vi.fn() }),
}));
vi.mock("@/hooks/use-visualisation-assets", () => ({
  useVisualisationAssets: () => ({ assets: [], preparation: null }),
}));
vi.mock("@/hooks/use-editor-autosave", () => ({
  useEditorAutosave: () => ({
    dirty: false,
    saving: false,
    saveError: null,
    setSaveError: vi.fn(),
  }),
}));
vi.mock("@/components/editor/code-editor", () => ({
  CodeEditor: ({ handleRef }: { handleRef: MutableRefObject<unknown> }) => {
    useEffect(() => {
      handleRef.current = { replaceDocument: m.replace };
    }, [handleRef]);
    return null;
  },
}));
import { EditorShell } from "./editor-shell";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function generate(events: object[]) {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/api/billing"
        ? {
            ok: true,
            json: async () => ({ available: 1000, generationCost: 100 }),
          }
        : new Response(
            events.map((event) => JSON.stringify(event)).join("\n") + "\n",
          ),
    ),
  );
  const visualisation = {
    id: "vis",
    owner_id: "owner",
    title: "Test",
    source: "original",
    visibility: "private",
  } as Database["public"]["Tables"]["visualisations"]["Row"];
  render(<EditorShell visualisation={visualisation} canEdit />);
  fireEvent.change(
    screen.getByRole("textbox", {
      name: "Describe a change to this visualisation",
    }),
    { target: { value: "Draw a star" } },
  );
  await waitFor(() =>
    expect(screen.queryByText("Loading credits…")).toBeNull(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Generate code" }));
  await screen.findByRole("alertdialog");
}
it.each(["exhausted", "error", "interrupted"])(
  "accepts the last attempt only after user choice: %s",
  async (failure) => {
    const events: object[] = [{ type: "attempt", source: "candidate" }];
    if (failure !== "interrupted")
      events.push({
        type: failure,
        source: "candidate",
        message: "Failed",
        diagnostics: "Invalid",
      });
    await generate(events);
    expect(m.replace).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Accept last code attempt" }),
    );
    expect(m.replace).toHaveBeenCalledExactlyOnceWith("candidate");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  },
);
it("returns to the retained prompt without changing the script", async () => {
  await generate([
    {
      type: "exhausted",
      source: "candidate",
      message: "Failed",
      diagnostics: "Invalid",
    },
  ]);
  fireEvent.click(
    screen.getByRole("button", { name: "Edit prompt and try again" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  const prompt = screen.getByRole("textbox", {
    name: "Describe a change to this visualisation",
  }) as HTMLTextAreaElement;
  expect(prompt.value).toBe("Draw a star");
  await waitFor(() => expect(document.activeElement).toBe(prompt));
  expect(m.replace).not.toHaveBeenCalled();
});
it("disables acceptance when no attempt exists", async () => {
  await generate([{ type: "error", message: "Model unavailable" }]);
  expect(
    (
      screen.getByRole("button", {
        name: "Accept last code attempt",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText(/No code attempt is available/)).toBeTruthy();
});
