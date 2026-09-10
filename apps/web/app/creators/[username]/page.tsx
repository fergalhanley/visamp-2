import type { Metadata } from "next";

import { CreatorGallery } from "@/components/creators/creator-gallery";

export async function generateMetadata({
  params,
}: PageProps<"/creators/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `${username} — Creators` };
}

export default async function SelectedCreatorPage({
  params,
}: PageProps<"/creators/[username]">) {
  const { username } = await params;
  return <CreatorGallery initialUsername={username} />;
}
