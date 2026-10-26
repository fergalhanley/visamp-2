import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@visamp/engine", () => {
  throw new Error("WASM download failed");
});

import { LfoDemo } from "../../app/dev/lfo/lfo-demo";

afterEach(cleanup);

it("reports an engine startup failure on the demo instead of leaving an unexplained blank canvas", async () => {
  render(<LfoDemo />);
  expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
  expect(screen.getByRole("status").textContent).toContain("Loading engine");
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Could not start the rendering engine");
  expect(alert.textContent).toContain("Reload the page to retry");
});
