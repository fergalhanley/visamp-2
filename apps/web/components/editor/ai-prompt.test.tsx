import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useState, type ComponentProps } from "react";
import { AiPrompt } from "./ai-prompt";
function Prompt(
  props: Omit<ComponentProps<typeof AiPrompt>, "prompt" | "onPromptChange">,
) {
  const [prompt, setPrompt] = useState("");
  return <AiPrompt {...props} prompt={prompt} onPromptChange={setPrompt} />;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each([false, true])(
  "enforces full request cost with exemption=%s",
  async (exempt) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ available: 50, generationCost: 100, exempt }),
      }),
    );
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<Prompt disabled={false} generating={false} onSubmit={submit} />);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Draw a star" },
    });
    await waitFor(() =>
      expect(screen.queryByText("Loading credits…")).toBeNull(),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    const button = screen.getByRole("button", {
      name: "Generate code",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(!exempt);
    fireEvent.click(button);
    if (exempt)
      await waitFor(() => expect(submit).toHaveBeenCalledWith("Draw a star"));
    else expect(submit).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Top Up Credits" }).getAttribute("href"),
    ).toBe("/account/billing");
  },
);
it.each([false, true])(
  "retains failed prompts and clears successful prompts: success=%s",
  async (success) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          available: 1000,
          generationCost: 100,
          exempt: false,
        }),
      }),
    );
    const submit = vi.fn().mockResolvedValue(success);
    render(<Prompt disabled={false} generating={false} onSubmit={submit} />);
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Draw a star" } });
    await waitFor(() =>
      expect(screen.queryByText("Loading credits…")).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate code" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("Draw a star"));
    await waitFor(() => expect(input.value).toBe(success ? "" : "Draw a star"));
  },
);

it("clears the prompt without submitting or requiring credits", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ available: 0, generationCost: 100 }),
      }),
  );
  const submit = vi.fn();
  render(<Prompt disabled={false} generating={false} onSubmit={submit} />);
  const input = screen.getByRole("textbox") as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "Suggested inspiration" } });
  fireEvent.click(screen.getByRole("button", { name: "Clear Prompt" }));
  expect(input.value).toBe("");
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.queryByText("Loading credits…")).toBeNull(),
  );
});
it.each([
  { disabled: true, generating: false },
  { disabled: false, generating: true },
])("prevents clearing while editing is unavailable: %j", (state) => {
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
  const change = vi.fn();
  render(
    <AiPrompt
      {...state}
      prompt="Keep this"
      onPromptChange={change}
      onSubmit={vi.fn()}
    />,
  );
  const clear = screen.getByRole("button", {
    name: "Clear Prompt",
  }) as HTMLButtonElement;
  expect(clear.disabled).toBe(true);
  fireEvent.click(clear);
  expect(change).not.toHaveBeenCalled();
});
