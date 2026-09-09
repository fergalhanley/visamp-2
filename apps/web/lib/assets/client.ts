/**
 * VIS-53: turning the asset ids a script cites into pixels and geometry.
 *
 * Runs in the browser with the viewer's own session, which is the whole of the
 * access story: the select and the storage download both go through the
 * policies VIS-51 installed, so an asset this viewer may not read simply does
 * not come back. The engine is never given a way to fetch anything itself.
 */

import type { ResolvedAsset } from "@visamp/player";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { extractAssetReferences } from "./references.ts";
import { parseGlbMesh } from "./gltf.ts";

export const ASSET_BUCKET = "assets";

/** Textures beyond this are downscaled; a 8192² upload costs 256 MB of VRAM. */
const MAX_TEXTURE_SIZE = 2048;

/** The size an SVG is rasterised at when it declares none of its own. */
const DEFAULT_VECTOR_SIZE = 512;

export interface AssetResolution {
  assets: ResolvedAsset[];
  /** Ids cited by the source that could not be resolved, for VIS-55. */
  missing: string[];
}

/**
 * Resolves every asset a script references.
 *
 * One failure never fails the batch: a visual referencing four assets and one
 * withdrawal should still draw the other three.
 */
export async function resolveSourceAssets(
  supabase: SupabaseClient<Database>,
  source: string,
): Promise<AssetResolution> {
  const ids = extractAssetReferences(source);
  if (ids.length === 0) return { assets: [], missing: [] };

  // The read policy does the filtering. Rows that come back are readable by
  // this viewer; ids that do not are missing as far as the renderer cares.
  const { data, error } = await supabase
    .from("assets")
    .select("id,kind,object_key")
    .in("id", ids)
    .eq("status", "ready")
    .is("withdrawn_at", null);
  if (error) return { assets: [], missing: ids };

  const rows = data ?? [];
  const resolved = await Promise.all(
    rows.map(async (row) => {
      try {
        const file = await supabase.storage.from(ASSET_BUCKET).download(row.object_key);
        if (file.error || !file.data) return null;
        const bytes = new Uint8Array(await file.data.arrayBuffer());
        return row.kind === "model"
          ? toMesh(row.id, bytes)
          : await toTexture(row.id, row.kind, file.data, bytes);
      } catch {
        return null;
      }
    }),
  );

  const assets = resolved.filter((asset): asset is ResolvedAsset => asset !== null);
  const found = new Set(assets.map((asset) => asset.id));
  return { assets, missing: ids.filter((id) => !found.has(id)) };
}

function toMesh(id: string, bytes: Uint8Array): ResolvedAsset {
  const mesh = parseGlbMesh(bytes);
  return { id, kind: "mesh", ...mesh };
}

async function toTexture(
  id: string,
  kind: "bitmap" | "vector",
  blob: Blob,
  bytes: Uint8Array,
): Promise<ResolvedAsset | null> {
  const source =
    kind === "vector"
      ? await rasteriseVector(bytes)
      : await createImageBitmap(blob).catch(() => null);
  if (!source) return null;

  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  const pixels = context.getImageData(0, 0, width, height);
  return { id, kind: "texture", width, height, rgba: new Uint8Array(pixels.data.buffer) };
}

/**
 * Rasterises an SVG through an `<img>` rather than `createImageBitmap`, which
 * does not accept SVG in every browser we support. The blob URL is same-origin
 * and scripts never run in an image context, so this cannot execute the file —
 * and admission has already refused anything that could try.
 */
function rasteriseVector(bytes: Uint8Array): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const blob = new Blob([bytes as BlobPart], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      // An SVG sized only in percentages reports zero; give it a square to
      // draw into rather than producing an empty texture.
      if (!image.width || !image.height) {
        image.width = DEFAULT_VECTOR_SIZE;
        image.height = DEFAULT_VECTOR_SIZE;
      }
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}
