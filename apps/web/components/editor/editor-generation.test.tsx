import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect, type MutableRefObject } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
const m = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  write: vi.fn(),
  persist: null as
    | null
    | ((
        snapshot: { title: string; source: string; visibility: "private" },
        signal: AbortSignal,
      ) => Promise<void>),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const query = {
        update: vi.fn(() => query),
        eq: vi.fn(() => query),
        select: vi.fn(() => query),
        abortSignal: vi.fn(() => query),
        single: m.write,
      };
      return query;
    },
  }),
}));
vi.mock("@visamp/player", () => ({
  VisampCanvas: ({ source }: { source: string }) => (
    <output aria-label="Preview source">{source}</output>
  ),
}));
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
  useEditorAutosave: ({ persist }: { persist: typeof m.persist }) => {
    m.persist = persist;
    return {
      dirty: false,
      saving: false,
      saveError: null,
      setSaveError: vi.fn(),
    };
  },
}));
vi.mock("@/components/editor/code-editor", () => ({
  CodeEditor: ({
    handleRef,
    initialValue,
    onChange,
  }: {
    handleRef?: MutableRefObject<unknown>;
    initialValue: string;
    onChange: (value: string) => void;
  }) => {
    useEffect(() => {
      if (handleRef) handleRef.current = { replaceDocument: m.replace };
    }, [handleRef]);
    return (
      <textarea
        aria-label={handleRef ? "Editor code" : "Code attempt"}
        defaultValue={initialValue}
        onChange={(event) => onChange(event.target.value)}
      />
    );
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
      screen.getByRole("button", { name: "Accept code attempt · Free" }),
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
  fireEvent.click(screen.getByRole("button", { name: "Edit prompt · Free" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  const prompt = screen.getByRole("textbox", {
    name: "Describe a change to this visualisation",
  }) as HTMLTextAreaElement;
  expect(prompt.value).toBe("Draw a star");
  await waitFor(() => expect(document.activeElement).toBe(prompt));
  expect(m.replace).not.toHaveBeenCalled();
});
it("offers only OK when no attempt exists and retains the prompt", async () => {
  await generate([{ type: "error", message: "Model unavailable" }]);
  expect(screen.queryByRole("button", { name: /Accept code/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Try to fix/ })).toBeNull();
  expect(screen.getByText(/No code is available/)).toBeTruthy();
  expect(
    within(screen.getByRole("alertdialog")).getByText("Model unavailable"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "OK" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(
    (
      screen.getByRole("textbox", {
        name: "Describe a change to this visualisation",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("Draw a star");
});
it("cancels the prompt without accepting code", async () => {
  await generate([
    {
      type: "exhausted",
      source: "candidate",
      diagnostics: "Unknown function",
      message: "Failed",
    },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Cancel prompt · Free" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(
    (
      screen.getByRole("textbox", {
        name: "Describe a change to this visualisation",
      }) as HTMLTextAreaElement
    ).value,
  ).toBe("");
  expect(m.replace).not.toHaveBeenCalled();
});
it("accepts edits made inside the failure dialog", async () => {
  await generate([
    {
      type: "exhausted",
      source: "candidate",
      diagnostics: "Unknown function",
      message: "Failed",
    },
  ]);
  expect(
    within(screen.getByRole("alertdialog")).getByText(/Unknown function/),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Code attempt" }), {
    target: { value: "edited candidate" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Accept code attempt · Free" }),
  );
  expect(m.replace).toHaveBeenCalledExactlyOnceWith("edited candidate");
});
it("sends the edited code, diagnostic, original prompt and disclosed price to repair", async () => {
  await generate([
    {
      type: "exhausted",
      source: "candidate",
      diagnostics: "Unknown function",
      message: "Failed",
    },
  ]);
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Try to fix · 100 credits",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Code attempt" }), {
    target: { value: "edited candidate" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Try to fix · 100 credits" }),
  );
  await screen.findByRole("alertdialog");
  const calls = vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => url === "/api/ai/generate");
  expect(calls).toHaveLength(2);
  expect(JSON.parse(calls[1]![1]!.body as string)).toEqual({
    prompt: "Draw a star",
    source: "edited candidate",
    visId: "vis",
    mode: "repair",
    diagnostics: "Unknown function\n\nFailed",
    expectedCost: 100,
  });
  expect(m.replace).not.toHaveBeenCalled();
});

it("refreshes cached route data after a successful document save without replacing newer edits", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const original = {
    id: "vis",
    owner_id: "owner",
    title: "Test",
    source: "original",
    visibility: "private",
    thumb_pinned: true,
  } as Database["public"]["Tables"]["visualisations"]["Row"];
  const view = render(<EditorShell visualisation={original} canEdit />);
  const snapshot = {
    title: "Test",
    source: "saved edit",
    visibility: "private" as const,
  };
  m.write.mockResolvedValue({ error: null });
  fireEvent.change(screen.getByLabelText("Editor code"), {
    target: { value: "newer unsaved edit" },
  });
  await m.persist!(snapshot, new AbortController().signal);
  expect(m.refresh).toHaveBeenCalledOnce();
  view.rerender(
    <EditorShell
      visualisation={{ ...original, source: snapshot.source }}
      canEdit
    />,
  );
  expect(
    (screen.getByLabelText("Editor code") as HTMLTextAreaElement).value,
  ).toBe("newer unsaved edit");
  await waitFor(() =>
    expect(screen.getByLabelText("Preview source").textContent).toBe(
      "newer unsaved edit",
    ),
  );
  view.unmount();
  render(
    <EditorShell
      visualisation={{ ...original, source: snapshot.source }}
      canEdit
    />,
  );
  expect(
    (screen.getByLabelText("Editor code") as HTMLTextAreaElement).value,
  ).toBe("saved edit");
  expect(screen.getByLabelText("Preview source").textContent).toBe(
    "saved edit",
  );
});
it("does not refresh the route when the document write fails", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  const original = {
    id: "vis",
    owner_id: "owner",
    title: "Test",
    source: "original",
    visibility: "private",
    thumb_pinned: true,
  } as Database["public"]["Tables"]["visualisations"]["Row"];
  render(<EditorShell visualisation={original} canEdit />);
  m.write.mockResolvedValue({ error: { message: "Write failed" } });
  await expect(
    m.persist!(
      { title: "Test", source: "edit", visibility: "private" },
      new AbortController().signal,
    ),
  ).rejects.toThrow("Write failed");
  expect(m.refresh).not.toHaveBeenCalled();
});
