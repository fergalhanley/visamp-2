import { loadArtistVisualisations } from "@/lib/artists/visualisations";
import { visualisationPath } from "@/lib/visualisation-url";
import { ArtistTabs } from "@/components/artists/artist-tabs";
import { ArtistLinkIcon } from "@/components/audio/artist-link-icon";
import { artistLinkTypes } from "@/lib/artists/links";
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

  return publicMetadata(
    `/artists/${encodeURIComponent(artist.slug)}`,
    artist.name,
    artist.bio || `Music by ${artist.name} on VisAmp.`,
  );
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
  const visualisations = await loadArtistVisualisations(artist.tracks);

  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content artist-profile-page">
        <section
          className="artist-hero"
          aria-label={`${artist.name} artist profile`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 banner or local fallback */}
          <img
            className="artist-hero-image"
            src={artist.bannerUrl ?? "/artist-banner-placeholder.svg"}
            alt=""
            fetchPriority="high"
          />
          <div className="artist-hero-shade" />
          <div className="artist-hero-identity">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 avatar */}
            <img
              src={artist.avatarUrl ?? "/VA.svg"}
              alt=""
              className="artist-hero-avatar"
            />
            <div className="min-w-0">
              <p className="site-eyebrow">ARTIST</p>
              <h1>{artist.name}</h1>
              <p className="artist-track-count">
                {artist.tracks.length}{" "}
                {artist.tracks.length === 1 ? "track" : "tracks"}
              </p>
            </div>
          </div>
        </section>
        <div className="artist-profile-summary">
          {artist.bio && <p className="artist-biography">{artist.bio}</p>}
          {artist.links.length > 0 && (
            <ul aria-label="Artist links" className="artist-profile-links">
              {artist.links.map((link) => (
                <li key={`${link.type}:${link.url}`}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    <ArtistLinkIcon type={link.type} />
                    <span className="min-w-0">
                      <span className="artist-link-label">
                        {
                          artistLinkTypes.find(
                            (kind) => kind.value === link.type,
                          )?.label
                        }
                      </span>
                      <span className="artist-link-url">
                        {link.url
                          .replace(/^https?:\/\//, "")
                          .replace(/\/$/, "")}
                      </span>
                    </span>
                    <span className="sr-only"> (new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ArtistTabs
          tracks={
            artist.tracks.length ? (
              <div className="site-table-wrap artist-tracks">
                <table className="site-table">
                  <thead>
                    <tr>
                      <th scope="col">Track</th>
                      <th scope="col">Album</th>
                      <th scope="col">Length</th>
                      <th scope="col">
                        <span className="sr-only">Playback</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {artist.tracks.map((track) => (
                      <tr key={track.id}>
                        <td>
                          <div className="artist-track-title">
                            {track.title}
                          </div>
                          {track.isExplicit && (
                            <span className="ml-2 text-[10px] text-[#9ba69e]">
                              EXPLICIT
                            </span>
                          )}
                        </td>
                        <td>{track.album ?? "—"}</td>
                        <td>{duration(track.durationMs)}</td>
                        <td>
                          <TrackPreview trackId={track.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="gallery-empty">
                <h3>Nothing live yet.</h3>
                <p>This artist hasn’t published any music yet.</p>
              </div>
            )
          }
          visualisations={
            visualisations.length ? (
              <div className="artist-visual-grid">
                {visualisations.map((vis) => (
                  <a
                    key={vis.id}
                    href={visualisationPath(vis)}
                    className="artist-visual-card"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- public thumbnail or local placeholder */}
                    <img
                      src={vis.thumbnail ?? "/artist-banner-placeholder.svg"}
                      alt=""
                      loading="lazy"
                    />
                    <div>
                      <h2>{vis.title}</h2>
                      <p>by {vis.creator}</p>
                      <p className="artist-visual-track">{vis.track}</p>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div className="gallery-empty">
                <h3>No visualisations yet.</h3>
                <p>
                  Public visualisations that choose this artist’s music as their
                  preferred track will appear here.
                </p>
              </div>
            )
          }
        />
        <p className="mt-10 text-sm">
          Is this your artist name? This may have been uploaded on your behalf by
          another user claiming permission to do so. We can have this associated
          with your own account (or removed if you wish) by{" "}
          <Link
            href="/dispute"
            className="font-medium text-emerald-400 underline underline-offset-4 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            clicking here
          </Link>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
