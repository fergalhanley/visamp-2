import { createRef } from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const engine = vi.hoisted(() => ({
  validate_script: vi.fn(() => ""),
  load_script: vi.fn(() => ""),
  clear_assets: vi.fn(),
  set_asset_texture: vi.fn(() => true),
  get_last_error: vi.fn(() => ""),
  get_canvas_filter: vi.fn(() => ""),
  capture_frame: vi.fn(async () => new Blob()),
}));
vi.mock("@visamp/engine", () => engine);
import { VisampCanvas } from "@visamp/player";
import type { ResolvedAsset, VisampCanvasHandle } from "@visamp/player";
afterEach(cleanup);
it("holds playback during preparation, then registers before init; diagnoses and blocks stale captures", async () => {
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  const ref = createRef<VisampCanvasHandle>();
  const compile = vi.fn(),
    retry = vi.fn();
  const asset: ResolvedAsset = {
    id: "texture",
    kind: "texture",
    width: 1,
    height: 1,
    rgba: new Uint8Array(4),
  };
  const loading = {
    status: "loading" as const,
    missing: [],
    retry,
    scope: "user1",
  };
  const ready = { ...loading, status: "ready" as const };
  const view = render(
    <VisampCanvas
      ref={ref}
      source="first"
      assets={[]}
      assetPreparation={loading}
      active
      onCompileResult={compile}
    />,
  );
  await waitFor(() =>
    expect(engine.validate_script).toHaveBeenCalledWith("first"),
  );
  expect(engine.load_script).not.toHaveBeenCalled();
  expect(engine.clear_assets).not.toHaveBeenCalled();
  expect(view.getByRole("status").textContent).toContain("Loading assets");
  expect(compile).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  view.rerender(
    <VisampCanvas
      ref={ref}
      source="first"
      assets={[asset]}
      assetPreparation={ready}
      active
    />,
  );
  await waitFor(() => expect(engine.load_script).toHaveBeenCalledWith("first"));
  expect(engine.set_asset_texture.mock.invocationCallOrder[0]).toBeLessThan(
    engine.load_script.mock.invocationCallOrder[0]!,
  );
  const clears = engine.clear_assets.mock.calls.length;
  view.rerender(
    <VisampCanvas
      ref={ref}
      source="second"
      assets={[]}
      assetPreparation={loading}
      active
    />,
  );
  expect(engine.clear_assets).toHaveBeenCalledTimes(clears);
  expect(engine.load_script).toHaveBeenCalledTimes(1);
  await expect(ref.current!.captureFrame()).rejects.toThrow("not ready");
  view.rerender(
    <VisampCanvas
      ref={ref}
      source="second"
      assets={[]}
      assetPreparation={{
        ...loading,
        status: "error",
        missing: ["missing-id"],
      }}
      active
    />,
  );
  expect(view.getByRole("alert").textContent).toContain("missing-id");
  act(() => view.getByRole("button", { name: "Retry" }).click());
  expect(retry).toHaveBeenCalledOnce();
  view.rerender(
    <VisampCanvas
      ref={ref}
      source="second"
      assets={[asset]}
      assetPreparation={ready}
      active
    />,
  );
  await waitFor(() =>
    expect(engine.load_script).toHaveBeenCalledWith("second"),
  );
  await expect(ref.current!.captureFrame()).resolves.toBeInstanceOf(Blob);
  view.rerender(
    <VisampCanvas
      ref={ref}
      source="second"
      assets={[]}
      assetPreparation={{ ...loading, scope: "user2" }}
      active
    />,
  );
  expect(engine.load_script).toHaveBeenLastCalledWith("");
});
