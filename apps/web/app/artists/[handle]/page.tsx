import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { loadArtist, type ArtistProfile } from "@/lib/artists/server";

/** `music_artists_slug_format`. Anything else cannot be an artist. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolve as an artist first, then fall back to the legacy creator link.
 *
 * VIS-6 split the namespace, and `/artists/<handle>` is the one path where the
 * two senses of "artist" still meet. Three outcomes, and the difference between
 * the last two matters:
 *
 * - a slug the viewer may see: the artist page;
 * - a slug that is nobody's artist: an old `/artists/<username>` creator link,
 *   redirected to its new home;
 * - a slug that *is* an artist the viewer may not see: 404, not a redirect.
 *   Sending it to `/creators` would be a worse lie, and no more private —
 *   the claim flow already discloses which slugs are taken by suffixing.
 */
async function resolve(handle: string): Promise<ArtistProfile> {
  const artist = SLUG.test(handle) ? await loadArtist(handle) : null;

  if (!artist) permanentRedirect(`/creators/${encodeURIComponent(handle)}`);
  if (!artist.isPublic && !artist.viewerIsClaimant) notFound();

  return artist;
}

export async function generateMetadata({
  params,
}: PageProps<"/artists/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  if (!SLUG.test(handle)) return { title: "Not found" };

  const artist = await loadArtist(handle);
  if (!artist || (!artist.isPublic && !artist.viewerIsClaimant))
    return { title: "Not found" };

  return {
    title: artist.name,
    description: artist.bio ?? `Music by ${artist.name} on VisAmp.`,
    // A page only its claimant can see must not be indexed if it ever leaks.
    robots: artist.isPublic ? undefined : { index: false, follow: false },
  };
}

function duration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default async function ArtistPage({
  params,
}: PageProps<"/artists/[handle]">) {
  const { handle } = await params;
  const artist = await resolve(handle);

  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-3xl">
        {!artist.isPublic && (
          <p className="site-badge">
            Only you can see this — your page goes live with your first approved
            track
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 URL; next/image cannot use a remote loader here */}
          <img
            src={artist.avatarUrl ?? "/VA.svg"}
            alt=""
            className="h-24 w-24 shrink-0 rounded-full bg-white/5 object-cover"
          />
          <div className="min-w-0">
            <p className="site-eyebrow" style={{ marginBottom: 8 }}>
              ARTIST
            </p>
            <h1 style={{ marginBottom: 8 }}>{artist.name}</h1>
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#9ba69e]">
              <span>
                {artist.tracks.length}{" "}
                {artist.tracks.length === 1 ? "track" : "tracks"}
              </span>
              {/* The act and the person are separate: this link exists only
                  when the claimant also makes visualisations. */}
              {artist.creatorUsername && (
                <a href={`/creators/${artist.creatorUsername}`}>
                  Visualisations by {artist.creatorUsername}
                </a>
              )}
              {artist.websiteUrl && (
                <a
                  href={artist.websiteUrl}
                  rel="noopener noreferrer nofollow"
                  target="_blank"
                >
                  Website
                </a>
              )}
            </p>
          </div>
        </div>

        {artist.bio && <p className="mt-8">{artist.bio}</p>}

        {artist.tracks.length ? (
          <div className="site-table-wrap mt-10">
            <table className="site-table">
              <thead>
                <tr>
                  <th scope="col">Track</th>
                  <th scope="col">Album</th>
                  <th scope="col">Length</th>
                </tr>
              </thead>
              <tbody>
                {artist.tracks.map((track) => (
                  <tr key={track.id}>
                    <td>
                      {track.title}
                      {track.isExplicit && (
                        <span className="ml-2 text-[10px] text-[#9ba69e]">
                          EXPLICIT
                        </span>
                      )}
                    </td>
                    <td>{track.album ?? "—"}</td>
                    <td>{duration(track.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="gallery-empty">
            <h3>Nothing live yet.</h3>
            <p>
              Your tracks appear here once we have approved your licence. Upload
              them now and they will publish themselves.
            </p>
            <a className="site-button secondary" href="/upload">
              Upload music
            </a>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
