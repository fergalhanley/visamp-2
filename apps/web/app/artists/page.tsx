import type { Metadata } from "next";

import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { listPublicArtists } from "@/lib/artists/server";

export const metadata: Metadata = {
  title: "Artists",
  description: "The musicians whose work you can hear on VisAmp.",
};

/**
 * VIS-6 gave "artist" to music acts; the visualisation creators this route used
 * to list now live at `/creators`.
 *
 * Only artists with something playable appear. That is not a filter applied
 * here — the list is built from live tracks, so an artist with nothing live is
 * absent by construction.
 */
export default async function ArtistsPage() {
  const artists = await listPublicArtists();

  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content">
        <p className="site-eyebrow">MUSIC ON VISAMP</p>
        <h1>The people behind the sound.</h1>
        <p>
          Every artist hosting their music here, and what they have released.
        </p>

        {artists.length ? (
          <ul className="mt-12 grid list-none grid-cols-1 gap-x-6 gap-y-8 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {artists.map((artist) => (
              <li key={artist.slug}>
                <a
                  href={`/artists/${artist.slug}`}
                  className="flex items-center gap-4 rounded-lg p-3 transition hover:bg-white/5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed R2 URL; next/image cannot use a remote loader here */}
                  <img
                    src={artist.avatarUrl ?? "/VA.svg"}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-full bg-white/5 object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px]">
                      {artist.name}
                    </span>
                    <span className="block text-xs text-[#9ba69e]">
                      {artist.trackCount}{" "}
                      {artist.trackCount === 1 ? "track" : "tracks"}
                      {artist.playCount > 0 && (
                        <>
                          {" · "}
                          {new Intl.NumberFormat("en", {
                            notation: "compact",
                          }).format(artist.playCount)}{" "}
                          plays
                        </>
                      )}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <div className="gallery-empty">
            <h3>The first release is on its way.</h3>
            <p>
              Artists appear here once their music is approved and live. If you
              make music, you can start uploading now.
            </p>
            <a className="site-button secondary" href="/upload">
              Upload your music
            </a>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
