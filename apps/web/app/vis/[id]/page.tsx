import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { VisSync } from "@/components/shell/vis-sync";
import { createClient } from "@/lib/supabase/server";
import { artistFromProfile, visualisationFromRow } from "@/lib/visualisations";

/**
 * RLS decides what is visible: public and unlisted to anyone, private only to
 * its owner. A miss is therefore both "no such id" and "not yours", which is
 * exactly E7.6's requirement that private returns 404 to non-owners.
 */
async function loadVisualisation(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("visualisations")
    .select("*, profiles(*)")
    .eq("id", id)
    .maybeSingle();

  return data ? visualisationFromRow(data, artistFromProfile(data.profiles)) : null;
}

/** E7.4 — shared links unfurl with the visualisation's own title and artwork. */
export async function generateMetadata({
  params,
}: PageProps<"/vis/[id]">): Promise<Metadata> {
  const { id } = await params;
  const vis = await loadVisualisation(id);
  if (!vis) return { title: "Not found" };

  const title = `${vis.title} by ${vis.artist.displayName}`;

  return {
    title: vis.title,
    description: vis.description,
    openGraph: {
      title,
      description: vis.description,
      type: "video.other",
      images: vis.thumbUrl ? [vis.thumbUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: vis.description,
      images: vis.thumbUrl ? [vis.thumbUrl] : undefined,
    },
  };
}

/**
 * E7.3 — the cold path. Arriving here from outside server-renders the title,
 * artist and description, then hands the visualisation to the live session; the
 * shell's boot gate turns the viewer's click into the gesture that starts
 * rendering and audio (E2.9).
 *
 * The warm path never reaches this component: selecting a tile swaps source
 * into the running engine and pushes the URL with the History API.
 */
export default async function VisPage({ params }: PageProps<"/vis/[id]">) {
  const { id } = await params;
  const vis = await loadVisualisation(id);

  if (!vis) notFound();

  return (
    <>
      <VisSync vis={vis} />
      <main className="sr-only">
        <article>
          <h1>{vis.title}</h1>
          <p>
            by{" "}
            <Link href={`/artist/${vis.artist.username}`}>
              {vis.artist.displayName}
            </Link>
          </p>
          {vis.description && <p>{vis.description}</p>}
          <p>
            {vis.likeCount} likes · {vis.viewCount} views · {vis.forkCount} forks
          </p>
        </article>
      </main>
    </>
  );
}
