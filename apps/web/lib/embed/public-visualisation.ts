import "server-only";
import { createEmbedClient } from "./public-client";
import { isVisualisationId, visualisationPath } from "@/lib/visualisation-url";
import { publicStorageUrl } from "@/lib/storage-urls";
import type { EmbedVisual } from "./examples";

export async function loadEmbedVisualisation(
  value: string,
): Promise<EmbedVisual | null> {
  if (!/^[a-zA-Z0-9-]{1,120}$/.test(value)) return null;
  const db = createEmbedClient();
  const { data, error } = await db
    .from("visualisations")
    .select(
      "id,slug,title,source,visibility,thumb_path,updated_at,profiles!visualisations_owner_id_fkey(username)",
    )
    .eq("visibility", "public")
    .eq(isVisualisationId(value) ? "id" : "slug", value)
    .abortSignal(AbortSignal.timeout(10_000))
    .maybeSingle();
  if (error) throw new Error("The visualisation could not be loaded.");
  // Defence in depth: protected/product/private source never enters the iframe.
  if (!data || data.visibility !== "public") return null;
  return {
    id: data.id,
    title: data.title,
    source: data.source,
    credit: data.profiles?.username ?? "Visamp creator",
    href: visualisationPath(data),
    poster: publicStorageUrl("thumbnails", data.thumb_path, data.updated_at),
  };
}
