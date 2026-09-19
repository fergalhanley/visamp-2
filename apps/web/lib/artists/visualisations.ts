import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { publicStorageUrl } from "@/lib/storage-urls";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";

/** Only live/licensed artist tracks and anonymous-visible visualisations qualify. */
export async function loadArtistVisualisations(tracks: HostedTrackSummary[]) {
  if (!tracks.length) return [];
  const { data, error } = await createPublicClient()
    .from("visualisations")
    .select(
      "id,slug,title,preferred_track_id,thumb_path,updated_at,profiles!visualisations_owner_id_fkey(username)",
    )
    .eq("visibility", "public")
    .in(
      "preferred_track_id",
      tracks.map((track) => track.id),
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Could not load artist visualisations.");
  const titles = new Map(tracks.map((track) => [track.id, track.title]));
  return (data ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    creator: row.profiles?.username ?? "Unknown creator",
    track: titles.get(row.preferred_track_id ?? "") ?? "",
    thumbnail: publicStorageUrl("thumbnails", row.thumb_path, row.updated_at),
  }));
}
