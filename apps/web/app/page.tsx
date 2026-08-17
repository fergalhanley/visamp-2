import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

/**
 * E2.8 / E7.5 — the landing route. What the viewer sees is the boot gate in the
 * shell; what a crawler sees is this: real HTML, server-rendered, behind the
 * canvas.
 *
 * Public only, filtered explicitly — unlisted work is reachable by link but is
 * excluded from browse and from the crawlable index (§4, E7.6).
 */
export default async function Home() {
  const supabase = await createClient();
  const { data: visualisations } = await supabase
    .from("visualisations")
    .select("id, title, description, profiles(username, display_name)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <main className="sr-only">
      <h1>VisAmp — community-built music visualisations</h1>
      <p>
        Watch visualisations built by the community, driven by your own
        microphone or your own local files. VisAmp hosts no music and nothing you
        play is uploaded.
      </p>

      <h2>Visualisations</h2>
      {visualisations && visualisations.length > 0 ? (
        <ul>
          {visualisations.map((vis) => (
            <li key={vis.id}>
              <Link href={`/vis/${vis.id}`}>{vis.title}</Link>
              {vis.profiles?.username && (
                <>
                  {" by "}
                  <Link href={`/artist/${vis.profiles.username}`}>
                    {vis.profiles.display_name ?? vis.profiles.username}
                  </Link>
                </>
              )}
              {vis.description ? ` — ${vis.description}` : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No public visualisations yet.</p>
      )}
    </main>
  );
}
