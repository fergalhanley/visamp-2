import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@visamp/engine", () => {
  throw new Error("WASM unavailable");
});
import { VisampCanvas } from "@visamp/player";
afterEach(cleanup);
it("reports engine download or startup failures to the host", async () => {
  const onLog = vi.fn();
  render(<VisampCanvas source="render {}" active hideErrors onLog={onLog} />);
  await waitFor(() =>
    expect(onLog).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error" }),
    ),
  );
});
