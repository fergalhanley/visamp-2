import { publicMetadata } from "@/lib/seo";
import { SessionSeed } from "@/components/shell/session-seed";
import { createClient } from "@/lib/supabase/server";
import { creatorFromProfile, visualisationFromRow } from "@/lib/visualisations";
export const metadata = publicMetadata("/player", "Music Visualizer Player", "Play local audio, SoundCloud and hosted music with community-made visualisations in the VisAmp browser player.");
export default async function PlayerPage() {
  const db = await createClient();
  const { data } = await db
    .from("visualisations")
    .select("*, profiles!visualisations_owner_id_fkey(*)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    <main className="sr-only">
      <h1>VisAmp player</h1>
      {data && (
        <SessionSeed
          vis={visualisationFromRow(data, creatorFromProfile(data.profiles))}
        />
      )}
    </main>
  );
}
