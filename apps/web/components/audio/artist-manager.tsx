"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArtistLinksEditor } from "./artist-links-editor";
import {
  parseArtistLinks,
  readArtistLinks,
  type ArtistLink,
} from "@/lib/artists/links";
import { Tabs } from "@base-ui/react/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  links?: ArtistLink[];
  avatarUrl: string;
  bannerUrl?: string | null;
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
          next="/manage-artists"
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
      <div className="site-form artist-selector mb-6">
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
  onSaved,
  banner = false,
}: {
  url: string;
  endpoint: string;
  label: string;
  banner?: boolean;
  onSaved?: () => void;
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
      onSaved?.();
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
        src={`${url}${url.includes("?") ? "&" : "?"}v=${version}`}
        alt={label}
        className={
          banner
            ? "aspect-[3/1] w-full rounded-lg bg-white/5 object-cover"
            : "h-24 w-24 rounded bg-white/5 object-cover"
        }
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
          JPEG, PNG or WebP, up to 4 MB.{" "}
          {banner
            ? "Use a wide image, ideally 2400 × 800. The centre is cropped to fit the banner."
            : "Square images work best."}
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
  const [links, setLinks] = useState(() =>
    readArtistLinks(artist.links, artist.website_url),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const tracks = useMusicPages<Track>(`/api/my-artists/${artist.id}`, "tracks");
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await musicRequest(
        `/api/my-artists/${artist.id}`,
        { name, bio, links: parseArtistLinks(links) },
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
    <Tabs.Root
      defaultValue="profile"
      className="artist-panel overflow-hidden rounded-xl border bg-white/[0.01]"
    >
      <Tabs.List aria-label="Artist management" className="flex border-b p-2">
        <Tabs.Tab
          value="profile"
          className="flex-1 cursor-pointer rounded-md px-3 py-2 text-sm text-muted-foreground data-[active]:bg-white/10 data-[active]:text-foreground focus-visible:outline-2"
        >
          Artist Profile
        </Tabs.Tab>
        <Tabs.Tab
          value="tracks"
          className="flex-1 cursor-pointer rounded-md px-3 py-2 text-sm text-muted-foreground data-[active]:bg-white/10 data-[active]:text-foreground focus-visible:outline-2"
        >
          Tracks &amp; Artwork
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="profile" keepMounted className="p-4 sm:p-6">
        <form
          className="site-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg">Artist profile</h2>
            <Link
              href={`/artists/${artist.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              View public profile
            </Link>
          </div>
          <ArtworkInput
            url={artist.avatarUrl}
            endpoint={`/api/my-artists/${artist.id}`}
            label="Artist image"
          />
          <ArtworkInput
            url={artist.bannerUrl ?? `/api/artwork/banner/${artist.id}`}
            endpoint={`/api/my-artists/${artist.id}?image=banner`}
            label="Artist banner"
            banner
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
          <ArtistLinksEditor
            links={links}
            onChange={setLinks}
            disabled={busy}
          />
          <button
            className="site-button primary"
            disabled={busy || !name.trim()}
            type="submit"
          >
            {busy ? "Saving…" : "Save artist profile"}
          </button>
          {message && <p role="status">{message}</p>}
        </form>
      </Tabs.Panel>
      <Tabs.Panel value="tracks" keepMounted className="p-4 sm:p-6">
        {tracks.items.length > 0 && (
          <div className="site-table-wrap">
            <table className="site-table min-w-[620px]">
              <caption className="sr-only">
                Tracks and artwork for {artist.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Artwork</th>
                  <th scope="col">Track</th>
                  <th scope="col">Album</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tracks.items.map((track) => (
                  <TrackDetails
                    key={track.id}
                    track={track}
                    artistId={artist.id}
                    onSaved={(patch) =>
                      tracks.updateItems((items) =>
                        items.map((item) =>
                          item.id === track.id ? { ...item, ...patch } : item,
                        ),
                      )
                    }
                    onRemoved={() =>
                      tracks.updateItems((items) =>
                        items.map((item) =>
                          item.id === track.id
                            ? { ...item, status: "withdrawn" }
                            : item,
                        ),
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
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
      </Tabs.Panel>
    </Tabs.Root>
  );
}
function TrackDetails({
  track,
  artistId,
  onSaved,
  onRemoved,
}: {
  track: Track;
  artistId: string;
  onSaved: (patch: { title: string; album: string | null }) => void;
  onRemoved: () => void;
}) {
  const [artworkVersion, setArtworkVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
      onSaved({ title, album: album || null });
      setEditing(false);
      setMessage("Track saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save track.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setMessage("");
    try {
      await musicRequest(`/api/my-tracks/${track.id}`, {}, "DELETE");
      onRemoved();
      setConfirmRemove(false);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not remove track.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <td>
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated artwork endpoint */}
        <img
          src={`${track.artworkUrl}?v=${artworkVersion}`}
          alt=""
          className="h-12 w-12 rounded object-cover"
        />
      </td>
      <th
        scope="row"
        className="max-w-56 break-words font-medium text-foreground"
      >
        {track.title}
      </th>
      <td className="max-w-40 break-words">{track.album || "—"}</td>
      <td>
        <span className="rounded-full bg-white/5 px-2 py-1 text-xs capitalize">
          {track.status}
        </span>
      </td>
      <td>
        {editable ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setEditing(true);
              }}
              aria-label={`Edit ${track.title}`}
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMessage("");
                setConfirmRemove(true);
              }}
              aria-label={`Remove ${track.title}`}
            >
              Remove
            </button>
          </div>
        ) : track.status === "withdrawn" ? (
          <Link
            className="underline underline-offset-4"
            href={`/upload?artist=${artistId}`}
          >
            Re-upload
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">Not editable</span>
        )}
        {message && !editing && !confirmRemove && (
          <p role="status" className="mt-2 text-xs">
            {message}
          </p>
        )}
        <Dialog
          open={editing}
          onOpenChange={(open) => {
            if (!busy) setEditing(open);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit {track.title}</DialogTitle>
              <DialogDescription>
                Update track details and artwork. Artwork uploads save
                immediately.
              </DialogDescription>
            </DialogHeader>
            <form
              className="site-form track-edit-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <ArtworkInput
                url={`${track.artworkUrl}?v=${artworkVersion}`}
                endpoint={`/api/my-tracks/${track.id}`}
                label={`Artwork for ${track.title}`}
                onSaved={() => setArtworkVersion(Date.now())}
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
              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className="site-button secondary"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="site-button primary"
                  disabled={busy || !title.trim()}
                >
                  {busy ? "Saving…" : "Save track"}
                </button>
              </div>
              {message && <p role="status">{message}</p>}
            </form>
          </DialogContent>
        </Dialog>
        <Dialog
          open={confirmRemove}
          onOpenChange={(open) => {
            if (!busy) setConfirmRemove(open);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove {track.title}?</DialogTitle>
              <DialogDescription>
                This track will no longer be available to listeners and will be
                removed from favourites and playlists. You can upload the
                recording again afterwards.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                className="site-button secondary"
                onClick={() => setConfirmRemove(false)}
              >
                Keep track
              </button>
              <button
                type="button"
                disabled={busy}
                className="site-button secondary text-destructive"
                onClick={() => void remove()}
              >
                {busy ? "Removing…" : "Remove track"}
              </button>
            </div>
            {message && <p role="alert">{message}</p>}
          </DialogContent>
        </Dialog>
      </td>
    </tr>
  );
}
