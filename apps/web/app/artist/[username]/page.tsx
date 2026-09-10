import { redirect } from "next/navigation";

/** Preserve old shared links while making the gallery the canonical profile. */
export default async function ArtistPage({
  params,
}: PageProps<"/artist/[username]">) {
  const { username } = await params;
  redirect(`/creators/${encodeURIComponent(username)}`);
}
