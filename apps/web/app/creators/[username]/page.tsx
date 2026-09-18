import type { Metadata } from "next";

import { CreatorGallery } from "@/components/creators/creator-gallery";
import { notFound } from "next/navigation";
import { loadPublicCreator } from "@/lib/creators/server";
import { publicMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: PageProps<"/creators/[username]">): Promise<Metadata> {
  const { username } = await params;
  const data = await loadPublicCreator(username);
  if (!data) notFound();
  const creator = data.stats.creator;
  return publicMetadata(`/creators/${encodeURIComponent(creator.username)}`,
    `${creator.username} — Visualisation Creator`,
    creator.bio || `Discover music visualisations created by ${creator.username} on VisAmp.`);
}

export default async function SelectedCreatorPage({
  params,
}: PageProps<"/creators/[username]">) {
  const { username } = await params;
  const data = await loadPublicCreator(username);
  if (!data) notFound();
  return <CreatorGallery initialUsername={username} initialCreator={data.stats} initialWork={data.work} />;
}
