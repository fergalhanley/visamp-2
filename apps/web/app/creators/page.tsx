import type { Metadata } from "next";

import { CreatorGallery } from "@/components/creators/creator-gallery";

export const metadata: Metadata = {
  title: "Creators",
  description: "Everyone building visualisations on VisAmp, and what they made.",
};

/**
 * E3.7 — the creator gallery, replacing the V panel's Creators tab.
 *
 * A client page throughout: the columns filter, sort and select against each
 * other, and the preview is the live engine rather than a picture of one.
 */
export default function CreatorsPage() {
  return <CreatorGallery />;
}
