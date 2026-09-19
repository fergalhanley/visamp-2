import { isVisualisationId, visualisationPath } from "@/lib/visualisation-url";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect, redirect } from "next/navigation";

import { VisSync } from "@/components/shell/vis-sync";
import { createClient } from "@/lib/supabase/server";
import { creatorFromProfile, visualisationFromRow } from "@/lib/visualisations";
import { cache } from "react";
import { publicMetadata, noIndex } from "@/lib/seo";

/**
 * RLS decides what is visible: public to anyone, private only to
 * its owner. A miss is therefore both "no such id" and "not yours", which is
 * exactly E7.6's requirement that private returns 404 to non-owners.
 */
const loadVisualisation = cache(async (id: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("visualisations")
    .select("*, profiles!visualisations_owner_id_fkey(*)")
    .eq(isVisualisationId(id) ? "id" : "slug", id)
    .maybeSingle();

  if (error) throw new Error("Could not load visualisation");
  return data ? visualisationFromRow(data, creatorFromProfile(data.profiles)) : null;
});

/** E7.4 — shared links unfurl with the visualisation's own title and artwork. */
export async function generateMetadata({
  params,
}: PageProps<"/vis/[id]">): Promise<Metadata> {
  const { id } = await params;
  const vis = await loadVisualisation(id);
  if (!vis) notFound();
  if (vis.visibility !== "public") return { title: "Private visualisation", robots: noIndex };

  const title = `${vis.title} by ${vis.creator.username}`;

  return publicMetadata(visualisationPath(vis), title,
    vis.description || `Play ${vis.title}, a music visualisation by ${vis.creator.username}, on VisAmp.`, vis.thumbUrl);
}

/**
 * E7.3 — the cold path. Arriving here from outside server-renders the title,
 * creator and description, then hands the visualisation to the live session; the
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

  if (id !== (vis.slug || vis.id)) {
    if (vis.visibility === "public") permanentRedirect(visualisationPath(vis));
    redirect(visualisationPath(vis));
  }

  return (
    <>
      <VisSync vis={vis} />
      <main className="sr-only">
        <article>
          <h1>{vis.title}</h1>
          <p>
            by{" "}
            <Link href={`/creators/${vis.creator.username}`}>
              {vis.creator.username}
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
