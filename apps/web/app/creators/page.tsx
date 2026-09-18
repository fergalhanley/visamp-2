import { publicMetadata } from "@/lib/seo";

import { CreatorGallery } from "@/components/creators/creator-gallery";

export const metadata = publicMetadata("/creators", "Visualisation Creators", "Explore the creators building music visualisations on VisAmp and discover their published work.");

/**
 * E3.7 — the creator gallery, replacing the V panel's Creators tab.
 *
 * The directory loads interactively. Selected creator routes also seed this
 * gallery server-side so their profile and public work are crawlable.
 */
export default function CreatorsPage() {
  return <CreatorGallery />;
}
