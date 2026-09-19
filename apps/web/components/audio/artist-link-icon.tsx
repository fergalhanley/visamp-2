import { Globe } from "lucide-react";
import paths from "@/lib/artists/link-icons.json";
import type { ArtistLinkType } from "@/lib/artists/links";

/** Brand paths: Simple Icons 13.21.0 (CC0); see dev/artist-profile-links.md. */
export function ArtistLinkIcon({ type }: { type: ArtistLinkType }) {
  if (type === "website")
    return <Globe aria-hidden="true" className="h-5 w-5 shrink-0" />;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5 shrink-0"
    >
      <path d={paths[type]} />
    </svg>
  );
}
