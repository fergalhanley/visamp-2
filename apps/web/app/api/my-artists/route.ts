import { musicError, musicIdentity, musicResponse } from "@/lib/music/api";
export async function GET() {
  try {
    const { db, userId } = await musicIdentity();
    const { data, error } = await db
      .from("music_artists")
      .select("id,slug,name,bio,website_url,avatar_key")
      .eq("claimed_by", userId!)
      .order("name");
    if (error) throw error;
    return musicResponse({
      artists: (data ?? []).map((a) => ({
        ...a,
        avatar_key: undefined,
        avatarUrl: `/api/artwork/artist/${a.id}`,
      })),
    });
  } catch (error) {
    return musicError(error);
  }
}
