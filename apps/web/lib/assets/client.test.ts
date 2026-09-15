import { expect, it, vi } from "vitest";
vi.mock("./gltf.ts", () => ({
  parseGlbModel: () => ({
    vertices: new Float32Array([0, 0, 0]),
    indices: new Uint32Array(),
    normals: new Float32Array(),
    uvs: new Float32Array(),
  }),
}));
import { resolveSourceAssets, preloadSourceAssets } from "./client";
const id = "00000000-0000-0000-0000-000000000001",
  source = `asset::model(id: "${id}")`;
function setup() {
  let allowed = true;
  let auth!: (event: string, session: unknown) => void;
  const download = vi.fn(async () => ({
    error: null,
    data: { arrayBuffer: async () => new ArrayBuffer(1) },
  }));
  const query = {
    select: () => query,
    in: () => query,
    eq: () => query,
    is: () => query,
    abortSignal: () =>
      Promise.resolve({
        error: null,
        data: allowed ? [{ id, kind: "model", object_key: "model.glb" }] : [],
      }),
  };
  const client = {
    auth: {
      onAuthStateChange: (cb: typeof auth) => {
        auth = cb;
      },
    },
    from: vi.fn(() => query),
    storage: { from: () => ({ download }) },
  };
  return {
    client: client as unknown as Parameters<typeof resolveSourceAssets>[0],
    download,
    deny: () => {
      allowed = false;
    },
    auth: (event: string, session: unknown) => auth(event, session),
  };
}
it("shares preloading with playback but rechecks permission before cache reuse", async () => {
  const fixture = setup();
  const [a, b] = await Promise.all([
    preloadSourceAssets(fixture.client, source),
    resolveSourceAssets(fixture.client, source),
  ]);
  expect(a.assets).toHaveLength(1);
  expect(a.assets[0]).toBe(b.assets[0]);
  expect(fixture.download).toHaveBeenCalledOnce();
  fixture.deny();
  expect(await resolveSourceAssets(fixture.client, source)).toEqual({
    assets: [],
    missing: [id],
  });
  expect(fixture.download).toHaveBeenCalledOnce();
});
it("invalidates decoded data on account changes", async () => {
  const fixture = setup();
  await resolveSourceAssets(fixture.client, source);
  fixture.auth("INITIAL_SESSION", { user: { id: "one" } });
  fixture.auth("SIGNED_OUT", null);
  await resolveSourceAssets(fixture.client, source);
  expect(fixture.download).toHaveBeenCalledTimes(2);
});
