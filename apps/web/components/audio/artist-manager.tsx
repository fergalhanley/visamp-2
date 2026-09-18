"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { ClaimArtistForm } from "./claim-artist-form";
import { musicRequest } from "@/lib/music/client";
import { useMusicPages } from "@/hooks/use-music-pages";
import { LoadMore } from "@/components/panels/load-more";

type Artist = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  website_url: string | null;
  avatarUrl: string;
};
type Track = {
  id: string;
  title: string;
  album: string | null;
  status: string;
  artworkUrl: string;
};
export function ArtistManager() {
  const { user, loading } = useAuth();
  const [signIn, setSignIn] = useState(false);
  if (loading) return <p>Loading…</p>;
  if (!user)
    return (
      <>
        <button className="site-button primary" onClick={() => setSignIn(true)}>
          Sign in to manage artists
        </button>
        <SignInDialog
          open={signIn}
          onOpenChange={setSignIn}
          next="/my-artists"
        />
      </>
    );
  return <OwnedArtists key={user.id} />;
}
function OwnedArtists() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    musicRequest<{ artists: Artist[] }>("/api/my-artists")
      .then((data) => {
        if (active) {
          setArtists(data.artists);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [version]);
  const artist = artists.find((a) => a.id === selected) ?? artists[0];
  if (loading) return <p>Loading artists…</p>;
  if (adding || (!artists.length && !error))
    return (
      <ClaimArtistForm
        onClaimed={(a) => {
          setSelected(a.id);
          setAdding(false);
          setLoading(true);
          setVersion((v) => v + 1);
        }}
        onCancel={artists.length ? () => setAdding(false) : undefined}
      />
    );
  return (
    <>
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>Retry</button>
        </p>
      )}
      <div className="site-form mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-full sm:basis-0">
            Artist
            <select
              value={artist?.id ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="site-button secondary"
            onClick={() => setAdding(true)}
          >
            Add artist
          </button>
          <a className="site-button secondary" href="/upload">
            Upload music
          </a>
        </div>
      </div>
      {artist && (
        <ArtistDetails
          key={artist.id}
          artist={artist}
          onSaved={() => setVersion((v) => v + 1)}
        />
      )}
    </>
  );
}
function ArtworkInput({
  url,
  endpoint,
  label,
}: {
  url: string;
  endpoint: string;
  label: string;
}) {
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setMessage("");
    try {
      if (file.size > 4 * 1024 * 1024)
        throw new Error("Choose an image under 4 MB.");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Could not save artwork.");
      setVersion(Date.now());
      setMessage("Artwork saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save artwork.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated signed artwork redirect */}
      <img
        src={`${url}?v=${version}`}
        alt={label}
        className="h-24 w-24 rounded bg-white/5 object-cover"
      />
      <div className="min-w-0 flex-1">
        <label>
          {busy ? "Saving artwork…" : label}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void upload(file);
              e.target.value = "";
            }}
            className="max-w-full"
          />
        </label>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG or WebP, up to 4 MB. Square images work best.
        </p>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
function ArtistDetails({
  artist,
  onSaved,
}: {
  artist: Artist;
  onSaved: () => void;
}) {
  const [name, setName] = useState(artist.name);
  const [bio, setBio] = useState(artist.bio ?? "");
  const [website, setWebsite] = useState(artist.website_url ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const tracks = useMusicPages<Track>(`/api/my-artists/${artist.id}`, "tracks");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await musicRequest(
        `/api/my-artists/${artist.id}`,
        { name, bio, websiteUrl: website },
        "PATCH",
      );
      setMessage("Profile saved.");
      onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <form
        className="site-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2>Artist profile</h2>
          <Link href={`/artists/${artist.slug}`} className="text-sm underline">
            View public profile
          </Link>
        </div>
        <ArtworkInput
          url={artist.avatarUrl}
          endpoint={`/api/my-artists/${artist.id}`}
          label="Artist image"
        />
        <label>
          Artist name
          <input
            value={name}
            maxLength={120}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Bio
          <textarea
            value={bio}
            maxLength={2000}
            rows={4}
            onChange={(e) => setBio(e.target.value)}
          />
        </label>
        <label>
          Website
          <input
            type="url"
            value={website}
            maxLength={500}
            placeholder="https://"
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
        <button
          className="site-button primary"
          disabled={busy || !name.trim()}
          type="submit"
        >
          {busy ? "Saving…" : "Save artist profile"}
        </button>
        {message && <p role="status">{message}</p>}
      </form>
      <h2 className="mt-10">Tracks & artwork</h2>
      {tracks.items.map((track) => (
        <TrackDetails key={track.id} track={track} />
      ))}
      {!tracks.loading && !tracks.items.length && !tracks.error && (
        <p>
          No tracks yet.{" "}
          <a href="/upload" className="underline">
            Upload your first track
          </a>
          .
        </p>
      )}
      {tracks.error && (
        <p role="alert">
          {tracks.error} <button onClick={tracks.more}>Retry</button>
        </p>
      )}
      <LoadMore
        more={tracks.more}
        loading={tracks.loading}
        hasMore={!tracks.error && tracks.next !== null}
      />
    </>
  );
}
function TrackDetails({ track }: { track: Track }) {
  const [title, setTitle] = useState(track.title);
  const [album, setAlbum] = useState(track.album ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editable = ["live", "draft"].includes(track.status);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await musicRequest(
        `/api/my-tracks/${track.id}`,
        { title, album },
        "PATCH",
      );
      setMessage("Track saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save track.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="site-form my-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h3>
        {track.title}{" "}
        <span className="text-xs text-muted-foreground">· {track.status}</span>
      </h3>
      {editable ? (
        <>
          <ArtworkInput
            url={track.artworkUrl}
            endpoint={`/api/my-tracks/${track.id}`}
            label={`Artwork for ${track.title}`}
          />
          <label>
            Track title
            <input
              value={title}
              maxLength={200}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Album
            <input
              value={album}
              maxLength={200}
              onChange={(e) => setAlbum(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="site-button secondary"
          >
            {busy ? "Saving…" : "Save track"}
          </button>
          {message && <p role="status">{message}</p>}
        </>
      ) : (
        <p>This track is not currently editable.</p>
      )}
    </form>
  );
}
