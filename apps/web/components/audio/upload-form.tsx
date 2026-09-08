"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountMenu } from "@/components/auth/account-menu";

type UploadData = {
  artists: { id: string; name: string; slug: string }[];
  licences: { id: string; artistId: string; signedAt: string }[];
  uploads: {
    id: string;
    title: string;
    status: string;
    error: string | null;
  }[];
  admin: boolean;
};
export function UploadForm() {
  const { user, loading } = useAuth();
  if (loading) return <p className="mt-8">Checking your account…</p>;
  if (!user)
    return (
      <div className="site-form">
        <h2>Bring your sound to VisAmp.</h2>
        <p>Log in to upload tracks and follow their progress.</p>
        <AccountMenu />
      </div>
    );
  return <UserUploads key={user.id} />;
}
function UserUploads() {
  const [data, setData] = useState<UploadData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artistId, setArtistId] = useState("");
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [completionId, setCompletionId] = useState<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/uploads", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (active.current) {
        setData(result);
        setError(null);
      }
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error ? cause.message : "Could not load uploads.",
        );
    }
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      xhr.current?.abort();
    };
  }, []);
  useEffect(() => {
    // The state updates in refresh occur after the network request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  async function complete(id: string) {
    const response = await fetch("/api/uploads/" + id + "/complete", {
      method: "POST",
    });
    const result = await response.json();
    if (!active.current) return;
    if (!response.ok) {
      if (response.status < 500 && response.status !== 429)
        setCompletionId(null);
      throw new Error(result.error);
    }
    if (result.status === "failed") {
      setCompletionId(null);
      throw new Error("Upload expired. Please submit again.");
    }
    setCompletionId(null);
    formRef.current?.reset();
    setArtistId("");
    setProgress(
      "Upload received. Your track is queued for processing and admin review.",
    );
    await refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const file = fields.get("file") as File;
    if (!file?.size || file.size > 250 * 1024 * 1024) {
      setProgress("Choose a lossless audio file up to 250 MB.");
      return;
    }
    setPending(true);
    setProgress("Preparing your file…");
    let uploadId: string | null = null;
    let transferred = false;
    try {
      const hash = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      if (!active.current) return;
      const sha256 = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const response = await fetch("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.get("title"),
          artistId: fields.get("artistId"),
          licenceId: fields.get("licenceId"),
          fileName: file.name,
          bytes: file.size,
          sha256,
          rightsConfirmed: fields.get("rights") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      uploadId = result.id;
      if (!active.current) return;
      await new Promise<void>((resolve, reject) => {
        const upload = new XMLHttpRequest();
        xhr.current = upload;
        upload.open("PUT", result.url);
        upload.setRequestHeader("Content-Type", result.contentType);
        upload.timeout = 15 * 60 * 1000;
        upload.upload.onprogress = (event) => {
          if (event.lengthComputable)
            setProgress(
              "Uploading… " +
                Math.round((event.loaded / event.total) * 100) +
                "%",
            );
        };
        upload.onload = () =>
          upload.status >= 200 && upload.status < 300
            ? resolve()
            : reject(new Error("Upload failed. Please try again."));
        upload.onerror = () =>
          reject(
            new Error("Could not upload. Check your connection and try again."),
          );
        upload.ontimeout = () =>
          reject(new Error("Upload timed out. Please try again."));
        upload.onabort = () => reject(new Error("Upload cancelled."));
        upload.send(file);
      });
      transferred = true;
      setCompletionId(result.id);
      await complete(result.id);
    } catch (cause) {
      if (uploadId && !transferred) {
        // Release this user's pending slot after a failed transfer. The
        // admission expiry remains the fallback if the network is unavailable.
        await fetch("/api/uploads/" + uploadId + "/cancel", {
          method: "POST",
          keepalive: true,
        }).catch(() => {});
        if (active.current) await refresh();
      }
      if (active.current)
        setProgress(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      if (active.current) setPending(false);
    }
  }
  if (!data)
    return (
      <div className="site-form">
        <p role="status">{error ?? "Loading your artist profile…"}</p>
        {error && (
          <button
            className="site-button secondary"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        )}
      </div>
    );
  const selectedArtist = artistId || data.artists[0]?.id || "";
  const licences = data.licences.filter(
    (licence) => licence.artistId === selectedArtist,
  );
  return (
    <>
      {!data.artists.length ? (
        <div className="site-form">
          <h2>Your artist profile needs to be linked.</h2>
          <p>
            A site admin must link your account to a music artist and approve a
            licence before you can upload tracks.
          </p>
        </div>
      ) : (
        <form ref={formRef} onSubmit={submit} className="site-form">
          <label>
            Artist
            <select
              name="artistId"
              value={selectedArtist}
              onChange={(event) => setArtistId(event.target.value)}
              disabled={pending}
            >
              {data.artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Licence
            <select
              key={selectedArtist}
              name="licenceId"
              required
              disabled={pending || !licences.length}
            >
              {!licences.length && (
                <option value="">No approved licence available</option>
              )}
              {licences.map((licence) => (
                <option key={licence.id} value={licence.id}>
                  Approved {licence.signedAt.slice(0, 10)} ·{" "}
                  {licence.id.slice(0, 8)}
                </option>
              ))}
            </select>
            {!licences.length && (
              <small>
                Your artist needs an approved licence before uploading.
              </small>
            )}
          </label>
          <label>
            Track title
            <input
              name="title"
              required
              maxLength={200}
              placeholder="Give your track a name"
              disabled={pending}
            />
          </label>
          <label>
            Lossless master
            <input
              type="file"
              name="file"
              required
              accept=".wav,.flac,.aif,.aiff"
              disabled={pending}
            />
            <small>
              WAV, FLAC or AIFF · up to 250 MB · up to 30 minutes · at least
              44.1 kHz. We create the playback formats for you.
            </small>
          </label>
          <label className="check-label">
            <input type="checkbox" name="rights" required disabled={pending} />
            <span>
              I’m authorised to upload this recording under the selected
              licence.
            </span>
          </label>
          <small>
            Tracks are reviewed before publication. Keep this page open until
            the upload finishes.
          </small>
          <button
            className="site-button primary justify-self-start"
            disabled={pending || !licences.length || !!completionId}
          >
            {pending ? "Uploading…" : "Upload track"}
          </button>
          <p role="status" className="site-message">
            {progress}
          </p>
          {completionId && !pending && (
            <button
              type="button"
              className="site-button secondary"
              onClick={async () => {
                setPending(true);
                try {
                  await complete(completionId);
                } catch (cause) {
                  setProgress(
                    cause instanceof Error ? cause.message : "Please retry.",
                  );
                } finally {
                  setPending(false);
                }
              }}
            >
              Retry submission
            </button>
          )}
        </form>
      )}
      <section className="mt-12">
        <h2>Your recent uploads</h2>
        {error && <p role="alert">{error}</p>}
        {!data.uploads.length ? (
          <p className="text-sm text-muted-foreground">
            Your uploads will appear here.
          </p>
        ) : (
          <div className="site-table-wrap">
            <table className="site-table">
              <thead>
                <tr>
                  <th>Track</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.uploads.map((upload) => (
                  <tr key={upload.id}>
                    <td>{upload.title}</td>
                    <td>
                      {upload.status === "completed"
                        ? "Ready for review"
                        : upload.status}
                    </td>
                    <td>{upload.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
