import { permanentRedirect } from "next/navigation";

/**
 * Old creator profile links, kept working.
 *
 * VIS-6 split the namespace: `/creators/<username>` is the person, and
 * `/artists/<slug>` becomes the music act. Every handle here is therefore a
 * creator username, because no artist pages exist yet — VIS-84 adds them, and
 * adds the `music_artists.slug` lookup that has to run *before* this redirect
 * once it does.
 *
 * A permanent redirect rather than a rewrite: the canonical location really
 * has moved, and letting it be cached is what stops the old path lingering in
 * links and search results.
 */
export default async function LegacyArtistProfilePage({
  params,
}: PageProps<"/artists/[handle]">): Promise<never> {
  const { handle } = await params;
  permanentRedirect(`/creators/${encodeURIComponent(handle)}`);
}
