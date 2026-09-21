import { identity, body, respond, failure, SetError } from "@/lib/sets/api";
import { parseSet, clips, validate } from "@/lib/sets/model";
import { createClient } from "@/lib/supabase/server";
import { getHostedPlayback } from "@/lib/hosted-audio/server";
import { resolveStreamUrl } from "@/lib/soundcloud/server";
/** Batch validation reuses playback gates, without spending one HTTP rate token per clip. */
export async function POST(request: Request) {
  try {
    await identity(request, true);
    const input = await body(request);
    let set;
    try {
      set = parseSet(input);
    } catch {
      throw new SetError(400, "Invalid set.");
    }
    const refs = [
      ...new Map(clips(set).map((c) => [c.media.id, c.media])).values(),
    ];
    if (refs.length > 40)
      throw new SetError(400, "Resolve up to 40 items per request.");
    const visuals: Record<string, string> = {},
      unavailable: Record<string, string> = {},
      durations: Record<string, number> = {};
    const db = await createClient();
    for (let i = 0; i < refs.length; i += 4)
      await Promise.all(
        refs.slice(i, i + 4).map(async (m) => {
          try {
            if (m.kind === "visual") {
              const { data, error } = await db
                .from("visualisations")
                .select("source")
                .eq("id", m.id)
                .maybeSingle();
              if (error || !data) throw new Error("Visualisation unavailable.");
              visuals[m.id] = data.source;
            } else if (m.source === "hosted") {
              const data = await getHostedPlayback(m.id);
              durations[m.id] = data.track.durationMs;
            } else if (m.source === "soundcloud") {
              const n = Number(m.id);
              if (!Number.isSafeInteger(n) || n <= 0) throw new Error();
              await resolveStreamUrl(n);
            }
          } catch {
            unavailable[m.id] =
              "Content is unavailable or you no longer have access.";
          }
        }),
      );
    const checked = {
      ...set,
      audioClips: set.audioClips.map((c) =>
        durations[c.media.id]
          ? { ...c, media: { ...c.media, durationMs: durations[c.media.id] } }
          : c,
      ),
    };
    return respond({
      visuals,
      unavailable,
      durations,
      issues: validate(checked, unavailable),
    });
  } catch (e) {
    return failure(e);
  }
}
