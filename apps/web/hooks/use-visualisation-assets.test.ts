import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  auth: { user: null as { id: string } | null, loading: false },
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => mocks.auth,
}));
vi.mock("@/lib/assets/client", () => ({ resolveSourceAssets: mocks.resolve }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
import { useVisualisationAssets } from "./use-visualisation-assets";
const source = (id: string) =>
  `asset::bitmap(id: "00000000-0000-0000-0000-00000000000${id}")`;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.auth.user = null;
});
it("ignores late results after selecting a newer visualisation", async () => {
  let a!: (value: unknown) => void, b!: (value: unknown) => void;
  mocks.resolve
    .mockImplementationOnce(() => new Promise((r) => (a = r)))
    .mockImplementationOnce(() => new Promise((r) => (b = r)));
  const view = renderHook(({ src }) => useVisualisationAssets(src), {
    initialProps: { src: source("1") },
  });
  expect(view.result.current.preparation.status).toBe("loading");
  view.rerender({ src: source("2") });
  await act(async () => b({ assets: [{ id: "b" }], missing: [] }));
  await act(async () => a({ assets: [{ id: "a" }], missing: [] }));
  expect(view.result.current.assets).toEqual([{ id: "b" }]);
});
it("retries failed references and rechecks after viewer changes", async () => {
  mocks.resolve
    .mockResolvedValueOnce({ assets: [], missing: ["missing"] })
    .mockResolvedValue({ assets: [{ id: "ok" }], missing: [] });
  const view = renderHook(() => useVisualisationAssets(source("1")));
  await waitFor(() =>
    expect(view.result.current.preparation.status).toBe("error"),
  );
  act(() => view.result.current.preparation.retry());
  await waitFor(() =>
    expect(view.result.current.preparation.status).toBe("ready"),
  );
  mocks.auth.user = { id: "another" };
  view.rerender();
  await waitFor(() => expect(mocks.resolve).toHaveBeenCalledTimes(3));
});
it("clears requirements immediately for an asset-free script", async () => {
  mocks.resolve.mockResolvedValue({ assets: [{ id: "a" }], missing: [] });
  const view = renderHook(({ src }) => useVisualisationAssets(src), {
    initialProps: { src: source("1") },
  });
  await waitFor(() => expect(view.result.current.assets).toHaveLength(1));
  view.rerender({ src: "render {}" });
  expect(view.result.current.assets).toEqual([]);
  expect(view.result.current.preparation.status).toBe("ready");
});

it("revalidates A when returning before B finishes, even with A still in state", async () => {
  mocks.resolve
    .mockResolvedValueOnce({ assets: [{ id: "a" }], missing: [] })
    .mockImplementation(() => new Promise(() => {}));
  const view = renderHook(({ src }) => useVisualisationAssets(src), {
    initialProps: { src: source("1") },
  });
  await waitFor(() =>
    expect(view.result.current.preparation.status).toBe("ready"),
  );
  view.rerender({ src: source("2") });
  view.rerender({ src: source("1") });
  expect(view.result.current.preparation.status).toBe("loading");
  expect(view.result.current.assets).toEqual([]);
  expect(mocks.resolve).toHaveBeenCalledTimes(3);
});
