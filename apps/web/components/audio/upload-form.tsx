"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  createFileHasher,
  runUploadQueue,
} from "@/lib/hosted-audio/upload-queue";
import { ClaimArtistForm, type UploadArtist } from "./claim-artist-form";
import { TrackPreview } from "./track-preview";
import { AccountMenu } from "@/components/auth/account-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { AGREEMENT_SUMMARY } from "@/lib/hosted-audio/agreement";
import {
  readTrackTags,
  titleFromFileName,
  type TrackTags,
} from "@/lib/hosted-audio/read-tags";

type UploadData = {
  artists: UploadArtist[];
  remainingToday: number;
  uploads: {
    id: string;
    title: string;
    status: string;
    error: string | null;
    track_id: string | null;
    tracks: { status: string } | null;
  }[];
  admin: boolean;
};

const MAX_BYTES = 250 * 1024 * 1024;
const ACCEPTED = [".mp3"];

type RowState =
  "queued" | "preparing" | "uploading" | "finishing" | "done" | "failed";

interface Row {
  key: string;
  file: File;
  title: string;
  tags: TrackTags | null;
  album: string;
  albumEdited: boolean;
  artwork: File | null;
  uploadId: string;
  artistId: string | null;
  admitted: boolean;
  transferred: boolean;
  trackId: string | null;
  trackStatus: string | null;
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
  done: "Available",
  failed: "Failed",
};

export function UploadForm({
  initialArtistId = "",
}: {
  initialArtistId?: string;
}) {
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
  return <UserUploads key={user.id} initialArtistId={initialArtistId} />;
}
function UserUploads({ initialArtistId }: { initialArtistId: string }) {
  const [data, setData] = useState<UploadData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artistId, setArtistId] = useState(initialArtistId);
  const [addingArtist, setAddingArtist] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [agreed, setAgreed] = useState(false);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const xhr = useRef(new Map<string, XMLHttpRequest>());
  const hashFile = useRef(createFileHasher());
  const cancelled = useRef(new Set<string>());
  const busy = useRef(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const active = useRef(true);
  const seq = useRef(0);
  const refreshSequence = useRef(0);

  const refresh = useCallback(async () => {
    const requestSequence = ++refreshSequence.current;
    try {
      const response = await fetch("/api/uploads", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (active.current && requestSequence === refreshSequence.current) {
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
    const transfers = xhr.current;
    return () => {
      active.current = false;
      for (const transfer of transfers.values()) transfer.abort();
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
        rejected.push(`${file.name} — needs to be MP3`);
        continue;
      }
      if (file.size === 0 || file.size > MAX_BYTES) {
        rejected.push(
          `${file.name} — ${megabytes(file.size)} must be between 1 byte and 250 MB`,
        );
        continue;
      }
      seq.current += 1;
      accepted.push({
        key: `${Date.now()}-${seq.current}`,
        file,
        uploadId: crypto.randomUUID(),
        artistId: null,
        admitted: false,
        transferred: false,
        trackId: null,
        trackStatus: null,
        title: titleFromFileName(file.name),
        tags: null,
        album: "",
        albumEdited: false,
        artwork: null,
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
                album: existing.albumEdited
                  ? existing.album
                  : (tags.album ?? ""),
                // Only overwrite the fallback title, never something typed.
                title:
                  existing.title === titleFromFileName(row.file.name) &&
                  tags.title
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
    if (!active.current || cancelled.current.has(row.key))
      throw new Error("Upload cancelled.");
    const uploadArtist = row.artistId ?? artist;
    patch(row.key, {
      artistId: uploadArtist,
      state: "preparing",
      error: null,
      percent: row.transferred ? 100 : 0,
    });

    if (row.transferred) return finishRow(row);
    const sha256 = await hashFile.current(row.file);
    if (!active.current || cancelled.current.has(row.key))
      throw new Error("Upload cancelled.");

    const response = await fetch("/api/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: row.title.trim(),
        artistId: uploadArtist,
        fileName: row.file.name,
        bytes: row.file.size,
        sha256,
        uploadId: row.uploadId,
        // The checkbox. Accepting the agreement is what creates the licence.
        rightsConfirmed: true,
      }),
    });
    const started = await response.json();
    if (!response.ok) throw new Error(started.error);
    patch(row.key, { admitted: true });
    if (started.status === "completed") {
      patch(row.key, { transferred: true });
      return finishRow(row);
    }
    if (!active.current || cancelled.current.has(row.key)) {
      await cancelRow(row);
      throw new Error("Upload cancelled.");
    }

    patch(row.key, { state: "uploading" });
    try {
      await new Promise<void>((resolve, reject) => {
        const put = new XMLHttpRequest();
        xhr.current.set(row.key, put);
        put.open("PUT", started.url);
        put.setRequestHeader("Content-Type", started.contentType);
        put.timeout = 15 * 60 * 1000;
        put.upload.onprogress = (event) => {
          if (event.lengthComputable)
            patch(row.key, {
              percent: Math.round((event.loaded / event.total) * 100),
            });
        };
        put.onload = () =>
          put.status >= 200 && put.status < 300
            ? resolve()
            : reject(new Error("Upload failed. Please try again."));
        put.onerror = () =>
          reject(
            new Error("Could not upload. Check your connection and try again."),
          );
        put.ontimeout = () =>
          reject(new Error("Upload timed out. Please try again."));
        put.onabort = () => reject(new Error("Upload cancelled."));
        put.onloadend = () => xhr.current.delete(row.key);
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

    patch(row.key, { transferred: true });
    await finishRow(row);
  }

  async function finishRow(row: Row) {
    patch(row.key, { state: "finishing", percent: 100 });
    const finish = await fetch(`/api/uploads/${row.uploadId}/complete`, {
      method: "POST",
    });
    const result = await finish.json();
    if (!finish.ok) {
      if (result.retryUpload)
        patch(row.key, { transferred: false, percent: 0 });
      throw new Error(result.error);
    }
    if (result.status !== "completed")
      throw new Error("Upload is not complete. Please retry.");
    patch(row.key, {
      trackId: result.trackId,
      trackStatus: result.trackStatus,
    });
    if (!active.current || cancelled.current.has(row.key)) return;
    try {
      if (row.albumEdited || row.tags?.album) {
        const details = await fetch(`/api/my-tracks/${result.trackId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: row.title, album: row.album }),
        });
        if (!details.ok) throw new Error((await details.json()).error);
      }
      if (row.artwork) {
        const artwork = await fetch(`/api/my-tracks/${result.trackId}`, {
          method: "POST",
          headers: { "Content-Type": row.artwork.type },
          body: row.artwork,
        });
        if (!artwork.ok) throw new Error((await artwork.json()).error);
      }
    } catch (cause) {
      throw new Error(
        `Music uploaded, but its details could not be saved. Retry to finish without uploading the MP3 again. ${cause instanceof Error ? cause.message : ""}`,
      );
    }
    patch(row.key, {
      state: "done",
      trackId: result.trackId,
      trackStatus: result.trackStatus,
    });
  }

  async function cancelRow(row: Row) {
    cancelled.current.add(row.key);
    xhr.current.get(row.key)?.abort();
    await fetch(`/api/uploads/${row.uploadId}/cancel`, {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
    patch(row.key, {
      state: "failed",
      error: "Upload cancelled.",
      percent: 0,
      transferred: false,
    });
  }

  async function uploadRows(pending: Row[]) {
    if (busy.current || !data || !agreed || !pending.length) return;
    const artist =
      data.artists.find((a) => a.id === artistId)?.id || data.artists[0]?.id;
    if (!artist) return;
    if (pending.some((row) => !row.title.trim())) {
      setNotice("Every track needs a title before it can be uploaded.");
      return;
    }
    if (pending.filter((row) => !row.admitted).length > data.remainingToday) {
      setNotice(
        `You can upload ${data.remainingToday} more new tracks today. Remove some files to continue; retries do not use another slot.`,
      );
      return;
    }
    busy.current = true;
    setRunning(true);
    setNotice(null);
    for (const row of pending) cancelled.current.delete(row.key);
    await runUploadQueue(
      pending,
      (row) => uploadRow(row, artist),
      (row, cause) => {
        if (active.current)
          patch(row.key, {
            state: "failed",
            error: cause instanceof Error ? cause.message : "Upload failed.",
          });
      },
      () => active.current,
    );
    busy.current = false;
    if (active.current) {
      setRunning(false);
      await refresh();
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    await uploadRows(rows.filter((row) => row.state !== "done"));
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

  if (!data.artists.length || addingArtist)
    return (
      <ClaimArtistForm
        onClaimed={(artist) => {
          refreshSequence.current += 1;
          setData((current) =>
            current
              ? {
                  ...current,
                  artists: [
                    ...current.artists.filter((item) => item.id !== artist.id),
                    artist,
                  ].sort((a, b) => a.name.localeCompare(b.name)),
                }
              : current,
          );
          setArtistId(artist.id);
          setAgreed(false);
          setAddingArtist(false);
        }}
        onCancel={
          data.artists.length ? () => setAddingArtist(false) : undefined
        }
      />
    );

  const selected =
    data.artists.find((artist) => artist.id === artistId)?.id ||
    data.artists[0]!.id;

  const queued = rows.filter((row) => row.state !== "done").length;
  const uploaded = rows.filter(
    (row) => row.state === "done" && row.trackStatus === "live",
  ).length;

  const totalBytes = rows.reduce((sum, row) => sum + row.file.size, 0);
  const sentBytes = rows.reduce(
    (sum, row) => sum + (row.file.size * row.percent) / 100,
    0,
  );
  const overallPercent = totalBytes
    ? Math.round((sentBytes / totalBytes) * 100)
    : 0;

  return (
    <>
      <form onSubmit={start} className="site-form">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1">
            Artist
            <select
              value={selected}
              onChange={(event) => {
                setArtistId(event.target.value);
                setAgreed(false);
              }}
              disabled={running}
            >
              {data.artists.map((artist) => (
                <option key={artist.id} value={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="site-button secondary"
            disabled={running}
            onClick={() => setAddingArtist(true)}
          >
            Add artist
          </button>
        </div>

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
            if (!running) void addFiles(event.dataTransfer.files);
          }}
          className={
            "rounded-lg border border-dashed p-6 text-center transition " +
            (dragging ? "border-[#d3fb90] bg-[#d3fb90]/10" : "border-white/20")
          }
        >
          <p className="text-sm">Drop your music here, or</p>
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
            accept=".mp3,audio/mpeg"
            className="hidden"
            onChange={(event) => {
              if (event.target.files) void addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <small className="mt-3 block">
            MP3 · up to 250 MB and 30 minutes each · 320 kbps recommended. Your
            files play as uploaded, without processing. {data.remainingToday}{" "}
            new tracks remaining today.
          </small>
        </div>

        {notice && (
          <p role="alert" className="site-message">
            {notice}
          </p>
        )}

        {rows.length > 0 && (
          <div className="site-table-wrap">
            <table className="site-table block sm:table">
              <thead className="sr-only sm:not-sr-only">
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
              <tbody className="block sm:table-row-group">
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className="block border-b border-white/10 py-4 sm:table-row"
                  >
                    <td className="block sm:table-cell">
                      <input
                        value={row.title}
                        onChange={(event) =>
                          patch(row.key, { title: event.target.value })
                        }
                        maxLength={200}
                        aria-label={`Title for ${row.file.name}`}
                        disabled={
                          running || row.transferred || row.state === "done"
                        }
                        className="w-full"
                      />
                      <label className="block mt-2 text-xs">
                        Album (optional)
                        <input
                          aria-label={`Album for ${row.file.name}`}
                          value={row.album}
                          maxLength={200}
                          disabled={running || row.state === "done"}
                          onChange={(event) =>
                            patch(row.key, {
                              album: event.target.value,
                              albumEdited: true,
                            })
                          }
                        />
                      </label>
                      <label className="block mt-2 text-xs">
                        Artwork (JPEG, PNG or WebP, up to 4 MB)
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          aria-label={`Artwork for ${row.file.name}`}
                          disabled={running || row.state === "done"}
                          onChange={(event) => {
                            const artwork = event.target.files?.[0] ?? null;
                            if (
                              artwork &&
                              (artwork.size > 4 * 1024 * 1024 ||
                                ![
                                  "image/jpeg",
                                  "image/png",
                                  "image/webp",
                                ].includes(artwork.type))
                            ) {
                              setNotice(
                                "Choose a JPEG, PNG or WebP image up to 4 MB.",
                              );
                              event.target.value = "";
                              patch(row.key, { artwork: null });
                              return;
                            }
                            patch(row.key, { artwork });
                          }}
                        />
                      </label>
                      {row.tags?.artist && (
                        <small>
                          {row.tags.artist}
                          {row.tags.album ? ` · ${row.tags.album}` : ""}
                        </small>
                      )}
                    </td>
                    <td className="block sm:table-cell">
                      {row.file.name}
                      <small className="block">
                        {megabytes(row.file.size)}
                        {row.tags?.sampleRate
                          ? ` · ${(row.tags.sampleRate / 1000).toFixed(1)} kHz`
                          : ""}
                      </small>
                    </td>
                    <td className="block sm:table-cell">
                      {duration(row.tags?.durationMs ?? null)}
                    </td>
                    <td className="block sm:table-cell">
                      {row.state === "uploading"
                        ? `${rowLabel.uploading} ${row.percent}%`
                        : row.state === "done" && row.trackStatus !== "live"
                          ? "Withdrawn / unavailable"
                          : rowLabel[row.state]}
                      {row.state === "uploading" && (
                        <progress
                          value={row.percent}
                          max={100}
                          aria-label={`Upload progress for ${row.file.name}`}
                          className="block w-full"
                        />
                      )}
                      {row.trackId && row.trackStatus === "live" && (
                        <TrackPreview trackId={row.trackId} />
                      )}
                      {row.error && (
                        <small className="block">{row.error}</small>
                      )}
                    </td>
                    <td className="block sm:table-cell">
                      {row.state === "failed" && (
                        <button
                          type="button"
                          disabled={running || !agreed}
                          onClick={() => void uploadRows([row])}
                        >
                          Retry
                        </button>
                      )}
                      {running &&
                        ["queued", "preparing", "uploading"].includes(
                          row.state,
                        ) && (
                          <button
                            type="button"
                            onClick={() => void cancelRow(row)}
                          >
                            Cancel
                          </button>
                        )}
                      <button
                        type="button"
                        onClick={() =>
                          setRows((current) =>
                            current.filter((item) => item.key !== row.key),
                          )
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

        {rows.length > 0 && (
          <div>
            <p aria-live="polite">
              {uploaded} of {rows.length} tracks available · {overallPercent}%
              transferred
            </p>
            <progress
              value={sentBytes}
              max={totalBytes || 1}
              aria-label="Overall upload progress"
              className="w-full"
            />
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
          <span>I agree to the VisAmp upload terms for these recordings.</span>
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
              ? "Your music is available now."
              : "Each track becomes available as soon as its upload is verified."}
        </p>
      </form>

      <section className="mt-12">
        <h2>Recent uploads</h2>
        {!data.uploads.length ? (
          <p className="text-sm text-muted-foreground">
            Your uploads will appear here.
          </p>
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
                      {upload.status === "completed"
                        ? upload.tracks?.status === "live"
                          ? "Available"
                          : "Withdrawn / unavailable"
                        : upload.status}
                    </td>
                    <td>
                      {upload.error ?? ""}
                      {upload.track_id && upload.tracks?.status === "live" && (
                        <TrackPreview trackId={upload.track_id} />
                      )}
                    </td>
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
