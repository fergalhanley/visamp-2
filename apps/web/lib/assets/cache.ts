import type { ResolvedAsset } from "@visamp/player";

/** Decoded data only; callers must check access before every lookup. */
export class DecodedAssetCache {
  private entries = new Map<string, { asset: ResolvedAsset; bytes: number }>();
  private pending = new Map<string, Promise<ResolvedAsset>>();
  private bytes = 0;
  private generation = 0;
  constructor(private readonly budget = 64 * 1024 * 1024) {}

  get version() {
    return this.generation;
  }

  clear() {
    this.generation++;
    this.entries.clear();
    this.pending.clear();
    this.bytes = 0;
  }

  async get(
    key: string,
    load: () => Promise<ResolvedAsset>,
  ): Promise<ResolvedAsset> {
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached.asset;
    }
    const pending = this.pending.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const request = load()
      .then((asset) => {
        if (generation !== this.generation)
          throw new Error("Asset session changed");
        const bytes =
          asset.kind === "texture"
            ? asset.rgba.byteLength
            : asset.vertices.byteLength +
              asset.indices.byteLength +
              asset.normals.byteLength +
              asset.uvs.byteLength +
              (asset.points?.byteLength ?? 0);
        if (bytes <= this.budget) {
          while (this.bytes + bytes > this.budget && this.entries.size) {
            const oldest = this.entries.keys().next().value!;
            this.bytes -= this.entries.get(oldest)!.bytes;
            this.entries.delete(oldest);
          }
          this.entries.set(key, { asset, bytes });
          this.bytes += bytes;
        }
        return asset;
      })
      .finally(() => {
        if (this.pending.get(key) === request) this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}
