import type { Metadata } from "next";

import { ArtistGallery } from "@/components/artists/artist-gallery";

export async function generateMetadata({
  params,
}: PageProps<"/artists/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} — Artists` };
}

export default async function SelectedArtistPage({
  params,
}: PageProps<"/artists/[username]">) {
  const { username } = await params;
  return <ArtistGallery initialUsername={username} />;
}
