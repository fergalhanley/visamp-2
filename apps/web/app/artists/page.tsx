import { permanentRedirect } from "next/navigation";

/**
 * `/artists` listed visualisation creators until VIS-6 gave "artist" back to
 * music acts. Old links land here and go on to the creator gallery.
 *
 * VIS-84 replaces this with the music-artist directory; the creator gallery
 * will be reachable only at `/creators` by then, which is the point.
 */
export default function LegacyArtistsPage(): never {
  permanentRedirect("/creators");
}
