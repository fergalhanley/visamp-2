import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
const canvas = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("@visamp/player", () => ({
  VisampCanvas: (props: Record<string, unknown>) => {
    canvas.props = props;
    return <div data-testid="canvas" />;
  },
}));
vi.mock("@/hooks/use-embed-assets", () => ({
  useEmbedAssets: () => ({ assets: [], preparation: { status: "ready" } }),
}));
import { EmbedPlayer } from "./embed-player";
const visuals = [
  {
    id: "one",
    title: "One",
    source: "one()",
    credit: "Artist",
    href: "/player",
  },
  {
    id: "two",
    title: "Two",
    source: "two()",
    credit: "Artist",
    href: "/player",
  },
];
const props: ComponentProps<typeof EmbedPlayer> = {
  visuals,
  initialId: "one",
  mode: "ambient",
  parentOrigin: "https://fergalflix.com",
  instance: "test",
};
let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: reduced,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function host(
  active: boolean,
  changes: Record<string, unknown> = {},
  origin = "https://fergalflix.com",
  source = window.parent,
) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin,
        source,
        data: {
          channel: "visamp:embed",
          version: 1,
          type: "host-state",
          instance: "test",
          active,
          userInitiated: false,
          ...changes,
        },
      }),
    ),
  );
}
it("keeps ambient silent, noninteractive and inactive until a trusted host activates it", () => {
  render(<EmbedPlayer {...props} />);
  expect(canvas.props).toMatchObject({
    active: false,
    interactive: false,
    analyser: null,
  });
  expect(screen.queryByRole("button")).toBeNull();
  host(true, {}, "https://evil.test");
  expect(canvas.props.active).toBe(false);
  host(true, { instance: "other" });
  expect(canvas.props.active).toBe(false);
  host(true, {}, "https://fergalflix.com", {} as Window);
  expect(canvas.props.active).toBe(false);
  host(true);
  expect(canvas.props.active).toBe(true);
  host(false);
  expect(canvas.props.active).toBe(false);
});
it("honours reduced motion until an explicit play request", () => {
  reduced = true;
  render(<EmbedPlayer {...props} />);
  host(true);
  expect(canvas.props.active).toBe(false);
  host(true, { userInitiated: true });
  expect(canvas.props.active).toBe(true);
});
it("launches showcase from a host click, allows pause and switches source without replacing the canvas", () => {
  render(<EmbedPlayer {...props} mode="showcase" />);
  const element = screen.getByTestId("canvas");
  expect(canvas.props.active).toBe(false);
  host(true, { userInitiated: true });
  expect(canvas.props.active).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Pause visualisation" }));
  expect(canvas.props.active).toBe(false);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "two" } });
  expect(canvas.props).toMatchObject({
    source: "two()",
    active: true,
    interactive: true,
  });
  expect(screen.getByTestId("canvas")).toBe(element);
});
it("pauses when the iframe document is hidden", () => {
  render(<EmbedPlayer {...props} />);
  host(true);
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  fireEvent(document, new Event("visibilitychange"));
  expect(canvas.props.active).toBe(false);
  hidden.mockRestore();
});
