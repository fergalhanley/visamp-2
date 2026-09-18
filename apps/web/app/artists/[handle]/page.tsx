import Link from "next/link";
import { TrackPreview } from "@/components/audio/track-preview";
import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { loadArtist, type ArtistProfile } from "@/lib/artists/server";
import { publicMetadata } from "@/lib/seo";

/** `music_artists_slug_format`. Anything else cannot be an artist. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Resolve artist names before the legacy creator URL fallback. */
async function resolve(handle: string): Promise<ArtistProfile> {
  const artist = SLUG.test(handle) ? await loadArtist(handle) : null;

  if (!artist) permanentRedirect(`/creators/${encodeURIComponent(handle)}`);

  return artist;
}

export async function generateMetadata({
  params,
}: PageProps<"/artists/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  if (!SLUG.test(handle)) return { title: "Not found" };

  const artist = await loadArtist(handle);
  if (!artist) return { title: "Not found" };

  return publicMetadata(`/artists/${encodeURIComponent(artist.slug)}`, artist.name,
    artist.bio || `Music by ${artist.name} on VisAmp.`);
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
                      <TrackPreview trackId={track.id} />
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
              This artist hasn’t published any music yet.
            </p>
          </div>
        )}
        <p className="mt-10 text-sm">
          Is this your artist name? <Link href="/dispute">Dispute this artist claim</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
