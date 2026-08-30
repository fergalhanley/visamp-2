import type { Metadata } from "next";

import { ArtistGallery } from "@/components/artists/artist-gallery";

export const metadata: Metadata = {
  title: "Artists",
  description: "Everyone building visualisations on VisAmp, and what they made.",
};

/**
 * E3.7 — the artist gallery, replacing the V panel's Artists tab.
 *
 * A client page throughout: the columns filter, sort and select against each
 * other, and the preview is the live engine rather than a picture of one.
 */
export default function ArtistsPage() {
  return <ArtistGallery />;
}
