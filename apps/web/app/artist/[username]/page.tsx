import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { artistFromProfile } from "@/lib/visualisations";

async function loadProfile(username: string) {
  const supabase = await createClient();

  // Usernames are unique case-insensitively, so match the same way.
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", username)
    .maybeSingle();

  return data;
}

export async function generateMetadata({
  params,
}: PageProps<"/artist/[username]">): Promise<Metadata> {
  const { username } = await params;
  const profile = await loadProfile(username);

  return profile
    ? { title: profile.display_name ?? profile.username ?? "Artist" }
    : { title: "Not found" };
}

/**
 * Minimal stand-in for E7.1 so the artist links in the title cluster (E2.6)
 * resolve. Bio, avatar upload, follow button and follower lists arrive with E7.
 *
 * Only public work is listed — this page is world-readable.
 */
export default async function ArtistPage({
  params,
}: PageProps<"/artist/[username]">) {
  const { username } = await params;
  const profile = await loadProfile(username);

  if (!profile) notFound();

  const artist = artistFromProfile(profile);
  const supabase = await createClient();
  const { data: work } = await supabase
    .from("visualisations")
    .select("id, title, description")
    .eq("owner_id", profile.id)
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  return (
    <main className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto p-6 pt-24">
      <div className="visamp-surface w-full max-w-lg rounded-2xl border p-6">
        <header className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-foreground/15" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold">{artist.displayName}</h1>
            <p className="text-xs text-muted-foreground">
              {artist.visCount} visualisations · {artist.totalViews} views
            </p>
          </div>
        </header>

        <h2 className="mt-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Visualisations
        </h2>
        {work && work.length > 0 ? (
          <ul className="mt-2 divide-y">
            {work.map((vis) => (
              <li key={vis.id} className="py-2">
                <Link href={`/vis/${vis.id}`} className="text-sm hover:underline">
                  {vis.title}
                </Link>
                {vis.description && (
                  <p className="text-xs text-muted-foreground">{vis.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing public yet.
          </p>
        )}

        <Link
          href="/"
          className="mt-6 inline-block text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to the player
        </Link>
      </div>
    </main>
  );
}
