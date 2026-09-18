import {
  musicError,
  musicRate,
  musicIdentity,
  musicResponse,
  MusicError,
} from "@/lib/music/api";

export async function GET(request: Request) {
  try {
    await musicRate(request);
    const { db } = await musicIdentity(false);
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
      throw new MusicError(400, "Invalid page.");
    let query = db
      .from("music_artists")
      .select("id,name,slug")
      .order("name")
      .order("id")
      .range(offset, offset + 40);
    const search = (params.get("q") ?? "").trim().slice(0, 200);
    if (search)
      query = query.ilike("name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error) throw error;
    return musicResponse({
      artists: (data ?? []).slice(0, 40),
      nextOffset: data && data.length > 40 ? offset + 40 : null,
    });
  } catch (error) {
    return musicError(error);
  }
}
