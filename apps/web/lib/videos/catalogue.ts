import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MusicError } from "@/lib/music/api";
import type { VideoCatalogueItem, VideoContent } from "./model";

type Database = ReturnType<typeof createAdminClient>;

/** Metadata only: source and playback credentials do not belong in authoring documents. */
export async function videoCatalogue(
  db: Database,
  userId: string,
  content?: VideoContent,
): Promise<VideoCatalogueItem[]> {
  const { data: artists, error: artistError } = await db
    .from("music_artists")
    .select("id,name")
    .eq("claimed_by", userId);
  if (artistError) throw artistError;
  const artistNames = new Map(
    (artists ?? []).map((artist) => [artist.id, artist.name]),
  );
  const items: VideoCatalogueItem[] = [];
  if (artistNames.size && (!content || content.audioClips.length)) {
    let query = db
      .from("tracks")
      .select("id,title,duration_ms,music_artist_id")
      .in("music_artist_id", [...artistNames.keys()])
      .eq("status", "live");
    if (content)
      query = query.in("id", [
        ...new Set(content.audioClips.map((c) => c.media.id)),
      ]);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? [])
      items.push({
        media: {
          id: row.id,
          kind: "audio",
          source: "hosted",
          title: row.title,
          attribution: artistNames.get(row.music_artist_id)!,
          durationMs: row.duration_ms,
        },
      });
  }
  if (!content || content.visualClips.length) {
    let query = db
      .from("visualisations")
      .select(
        "id,title,visibility,marketplace_price_credits,profiles!visualisations_owner_id_fkey(username)",
      )
      .in("visibility", ["public", "protected", "product"]);
    if (content)
      query = query.in("id", [
        ...new Set(content.visualClips.map((c) => c.media.id)),
      ]);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data ?? []) {
      if (
        row.visibility === "private" ||
        (row.visibility === "product" && row.marketplace_price_credits === null)
      )
        continue;
      items.push({
        media: {
          id: row.id,
          kind: "visual",
          source: "visual",
          title: row.title,
          attribution: row.profiles?.username ?? "Visamp creator",
        },
        distribution: row.visibility,
        ...(row.visibility === "product"
          ? { priceCredits: row.marketplace_price_credits! }
          : {}),
      });
    }
  }
  return items;
}

/** Authoritative references replace client titles, credits and claimed source durations. */
export function canonicalVideo(
  content: VideoContent,
  catalogue: VideoCatalogueItem[],
): VideoContent {
  const allowed = new Map(
    catalogue.map((item) => [
      `${item.media.kind}:${item.media.id}`,
      item.media,
    ]),
  );
  return {
    ...content,
    audioClips: content.audioClips.map((clip) => {
      const media = allowed.get(`audio:${clip.media.id}`);
      if (!media)
        throw new MusicError(
          403,
          "A track is unavailable or is not controlled by you. Remove it before saving.",
        );
      if (
        !media.durationMs ||
        clip.sourceOffsetMs + clip.durationMs > media.durationMs
      )
        throw new MusicError(
          400,
          "Audio clip exceeds the hosted track duration.",
        );
      return { ...clip, media: { ...media, kind: "audio", source: "hosted" } };
    }),
    visualClips: content.visualClips.map((clip) => {
      const media = allowed.get(`visual:${clip.media.id}`);
      if (!media)
        throw new MusicError(
          403,
          "A visual is no longer available for video use. Remove it before saving.",
        );
      return { ...clip, media: { ...media, kind: "visual", source: "visual" } };
    }),
  };
}
