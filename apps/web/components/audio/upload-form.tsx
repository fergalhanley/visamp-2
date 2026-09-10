"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { AGREEMENT_SUMMARY } from "@/lib/hosted-audio/agreement";
import { readTrackTags, titleFromFileName, type TrackTags } from "@/lib/hosted-audio/read-tags";

type UploadData = {
  artists: { id: string; name: string; slug: string }[];
  /** Artists whose licence an admin has activated, so their music can publish. */
  approvedArtistIds: string[];
  uploads: { id: string; title: string; status: string; error: string | null }[];
  admin: boolean;
};

const MAX_BYTES = 250 * 1024 * 1024;
const ACCEPTED = [".wav", ".flac", ".aif", ".aiff"];

type RowState = "queued" | "preparing" | "uploading" | "finishing" | "done" | "failed";

interface Row {
  key: string;
  file: File;
  title: string;
  tags: TrackTags | null;
  state: RowState;
  percent: number;
  error: string | null;
}

const duration = (ms: number | null) => {
  if (!ms) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const rowLabel: Record<RowState, string> = {
  queued: "Ready",
  preparing: "Preparing…",
  uploading: "Uploading",
  finishing: "Finishing…",
  done: "Uploaded",
  failed: "Failed",
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
  const [rows, setRows] = useState<Row[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const active = useRef(true);
  const seq = useRef(0);

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
        setError(cause instanceof Error ? cause.message : "Could not load uploads.");
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

  const patch = (key: string, change: Partial<Row>) =>
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );

  /**
   * Files arrive from the picker or a drop, and both can carry things we will
   * not take. Rejects are reported rather than silently dropped, because a
   * missing row is far more confusing than a sentence saying why.
   */
  const addFiles = useCallback(async (incoming: FileList | File[]) => {
    const rejected: string[] = [];
    const accepted: Row[] = [];

    for (const file of Array.from(incoming)) {
      const name = file.name.toLowerCase();
      if (!ACCEPTED.some((ext) => name.endsWith(ext))) {
        rejected.push(`${file.name} — needs to be WAV, FLAC or AIFF`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        rejected.push(`${file.name} — ${megabytes(file.size)} is over the 250 MB limit`);
        continue;
      }
      seq.current += 1;
      accepted.push({
        key: `${Date.now()}-${seq.current}`,
        file,
        title: titleFromFileName(file.name),
        tags: null,
        state: "queued",
        percent: 0,
        error: null,
      });
    }

    setNotice(rejected.length ? rejected.join(" · ") : null);
    if (!accepted.length) return;
    setRows((current) => [...current, ...accepted]);

    // Read the headers after the rows are on screen: a person can start typing
    // titles immediately rather than waiting on a dozen files being parsed.
    for (const row of accepted) {
      const tags = await readTrackTags(row.file);
      if (!active.current) return;
      setRows((current) =>
        current.map((existing) =>
          existing.key === row.key
            ? {
                ...existing,
                tags,
                // Only overwrite the fallback title, never something typed.
                title:
                  existing.title === titleFromFileName(row.file.name) && tags.title
                    ? tags.title
                    : existing.title,
              }
            : existing,
        ),
      );
    }
  }, []);

  /** One file, start to finish. Throws so the caller can mark the row failed. */
  async function uploadRow(row: Row, artist: string) {
    patch(row.key, { state: "preparing", error: null, percent: 0 });

    const digest = await crypto.subtle.digest("SHA-256", await row.file.arrayBuffer());
    if (!active.current) return;
    const sha256 = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: row.title.trim(),
        artistId: artist,
        fileName: row.file.name,
        bytes: row.file.size,
        sha256,
        // The checkbox. Accepting the agreement is what creates the licence.
        rightsConfirmed: true,
      }),
    });
    const started = await response.json();
    if (!response.ok) throw new Error(started.error);

    patch(row.key, { state: "uploading" });
    try {
      await new Promise<void>((resolve, reject) => {
        const put = new XMLHttpRequest();
        xhr.current = put;
        put.open("PUT", started.url);
        put.setRequestHeader("Content-Type", started.contentType);
        put.timeout = 15 * 60 * 1000;
        put.upload.onprogress = (event) => {
          if (event.lengthComputable)
            patch(row.key, { percent: Math.round((event.loaded / event.total) * 100) });
        };
        put.onload = () =>
          put.status >= 200 && put.status < 300
            ? resolve()
            : reject(new Error("Upload failed. Please try again."));
        put.onerror = () =>
          reject(new Error("Could not upload. Check your connection and try again."));
        put.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
        put.onabort = () => reject(new Error("Upload cancelled."));
        put.send(row.file);
      });
    } catch (cause) {
      // Release the pending slot so one bad transfer does not block the batch.
      await fetch(`/api/uploads/${started.id}/cancel`, {
        method: "POST",
        keepalive: true,
      }).catch(() => {});
      throw cause;
    }

    patch(row.key, { state: "finishing", percent: 100 });
    const finish = await fetch(`/api/uploads/${started.id}/complete`, { method: "POST" });
    const result = await finish.json();
    if (!finish.ok) throw new Error(result.error);
    if (result.status === "failed") throw new Error("Upload expired. Please submit again.");
    patch(row.key, { state: "done" });
  }

  /**
   * Sequential on purpose. These are lossless masters — several at once would
   * compete for the same upstream and make every one of them slower, and the
   * server caps concurrent admissions at three anyway.
   */
  async function start(event: FormEvent) {
    event.preventDefault();
    if (running || !data) return;

    const artist = artistId || data.artists[0]?.id;
    if (!artist) return;

    const pending = rows.filter((row) => row.state !== "done");
    if (!pending.length) return;

    const untitled = pending.find((row) => !row.title.trim());
    if (untitled) {
      setNotice("Every track needs a title before it can be uploaded.");
      return;
    }

    setRunning(true);
    setNotice(null);
    for (const row of pending) {
      if (!active.current) break;
      try {
        await uploadRow(row, artist);
      } catch (cause) {
        patch(row.key, {
          state: "failed",
          error: cause instanceof Error ? cause.message : "Upload failed.",
        });
      }
    }
    if (active.current) {
      setRunning(false);
      await refresh();
    }
  }

  if (!data)
    return (
      <div className="site-form">
        <p role="status">{error ?? "Loading your artist profile…"}</p>
        {error && (
          <button className="site-button secondary" onClick={() => void refresh()}>
            Try again
          </button>
        )}
      </div>
    );

  if (!data.artists.length) return <ClaimArtistForm onClaimed={refresh} />;

  const selected = artistId || data.artists[0]!.id;
  const approved = data.approvedArtistIds.includes(selected);
  const queued = rows.filter((row) => row.state !== "done").length;
  const uploaded = rows.filter((row) => row.state === "done").length;

  return (
    <>
      <form onSubmit={start} className="site-form">
        {data.artists.length > 1 ? (
          <label>
            Artist
            <select
              value={selected}
              onChange={(event) => setArtistId(event.target.value)}
              disabled={running}
            >
              {data.artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p>
            Uploading as <strong>{data.artists[0]!.name}</strong>.
          </p>
        )}

        {/* The button inside is the accessible control; this is only a drop target. */}
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void addFiles(event.dataTransfer.files);
          }}
          className={
            "rounded-lg border border-dashed p-6 text-center transition " +
            (dragging ? "border-[#d3fb90] bg-[#d3fb90]/10" : "border-white/20")
          }
        >
          <p className="text-sm">Drop your masters here, or</p>
          <button
            type="button"
            className="site-button secondary mt-3"
            onClick={() => fileInput.current?.click()}
            disabled={running}
          >
            Choose files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".wav,.flac,.aif,.aiff"
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <small className="mt-3 block">
            WAV, FLAC or AIFF · up to 250 MB each · at least 44.1 kHz. We create the
            playback formats for you.
          </small>
        </div>

        {notice && (
          <p role="alert" className="site-message">
            {notice}
          </p>
        )}

        {rows.length > 0 && (
          <div className="site-table-wrap">
            <table className="site-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">File</th>
                  <th scope="col">Length</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <input
                        value={row.title}
                        onChange={(event) => patch(row.key, { title: event.target.value })}
                        maxLength={200}
                        aria-label={`Title for ${row.file.name}`}
                        disabled={running || row.state === "done"}
                        className="w-full"
                      />
                      {row.tags?.artist && (
                        <small>
                          {row.tags.artist}
                          {row.tags.album ? ` · ${row.tags.album}` : ""}
                        </small>
                      )}
                    </td>
                    <td>
                      {row.file.name}
                      <small className="block">
                        {megabytes(row.file.size)}
                        {row.tags?.sampleRate
                          ? ` · ${(row.tags.sampleRate / 1000).toFixed(1)} kHz`
                          : ""}
                      </small>
                    </td>
                    <td>{duration(row.tags?.durationMs ?? null)}</td>
                    <td>
                      {row.state === "uploading"
                        ? `${rowLabel.uploading} ${row.percent}%`
                        : rowLabel[row.state]}
                      {row.error && <small className="block">{row.error}</small>}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          setRows((current) => current.filter((item) => item.key !== row.key))
                        }
                        disabled={running}
                        aria-label={`Remove ${row.file.name}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* VIS-86 — this replaces the licence dropdown. Accepting is what
            creates the licence, so there is nothing to choose. */}
        <label className="check-label">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            required
            disabled={running}
          />
          <span>
            I agree to the VisAmp upload terms for these recordings.
          </span>
        </label>
        <ul className="m-0 list-disc pl-5 text-xs text-[#9ba69e]">
          {AGREEMENT_SUMMARY.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <button
          className="site-button primary justify-self-start"
          disabled={running || !agreed || !queued}
        >
          {running
            ? "Uploading…"
            : queued > 1
              ? `Upload ${queued} tracks`
              : "Upload track"}
        </button>

        <p role="status" className="site-message">
          {running
            ? "Keep this page open until the uploads finish."
            : uploaded > 0 && !queued
              ? approved
                ? "Uploaded. Your tracks are queued for processing and will publish once processed."
                : "Uploaded. Your tracks are queued for processing, and go public once we have approved your licence."
              : !approved
                ? "You can upload now. Your music goes public once we have approved your licence."
                : ""}
        </p>
      </form>

      <section className="mt-12">
        <h2>Recent uploads</h2>
        {!data.uploads.length ? (
          <p className="text-sm text-muted-foreground">Your uploads will appear here.</p>
        ) : (
          <div className="site-table-wrap">
            <table className="site-table">
              <thead>
                <tr>
                  <th scope="col">Track</th>
                  <th scope="col">Status</th>
                  <th scope="col">Details</th>
                </tr>
              </thead>
              <tbody>
                {data.uploads.map((upload) => (
                  <tr key={upload.id}>
                    <td>{upload.title}</td>
                    <td>
                      {upload.status === "completed" ? "Ready for review" : upload.status}
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

/**
 * VIS-83 — the way in. This used to say an admin had to link your account
 * before you could do anything, which was a dead end reached by everybody who
 * had just signed up to upload music.
 *
 * Claiming is unverified on purpose. It grants the ability to upload, not a
 * public page: nothing an artist uploads is reachable by anyone else until an
 * admin activates their licence, and the artist's own page stays private until
 * a track goes live with it.
 */
function ClaimArtistForm({ onClaimed }: { onClaimed: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/uploads/artist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      // Straight into the upload form, which the refreshed artist list unlocks.
      await onClaimed();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create your artist.",
      );
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="site-form">
      <h2>What do you release under?</h2>
      <p>
        Your artist name is what listeners see beside your tracks. You can start
        uploading straight away — a track only becomes public once we have
        approved your licence.
      </p>
      <label>
        Artist name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          disabled={pending}
          placeholder="e.g. Deep Fixation"
          autoComplete="off"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button
        className="site-button primary"
        type="submit"
        disabled={pending || !name.trim()}
      >
        {pending ? "Creating…" : "Create artist profile"}
      </button>
    </form>
  );
}
