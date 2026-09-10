# Deployment

Two things run outside Vercel.

| Service | Where | Why it cannot live with the web app |
| --- | --- | --- |
| Render validator | Railway | Pooled headless Chromium; see `apps/validator/README.md` |
| Audio processing worker | Railway | Needs the FFmpeg binaries and runs for minutes per track |

The web app itself is on Vercel — see [VERCEL_BUILD.md](../VERCEL_BUILD.md).

## Audio processing worker

Transcodes uploaded masters into the playback renditions, generates the
waveform peaks, and moves a track to `draft` for review. Until it runs, an
upload sits in `queued` and the artist sees nothing happen.

It is a **scheduled batch, not a server**: it claims at most ten jobs, processes
them and exits. `claim_audio_upload` takes each job `FOR UPDATE SKIP LOCKED`, so
two overlapping runs cannot collide.

### Railway service settings

Add a **second service** to the Railway project — do not reuse the validator's.
There is no Railway configuration in this repository, so the validator is
configured entirely from the dashboard; adding anything at the repository root
that Nixpacks reads would change its build as well. The worker uses its own
Dockerfile for that reason.

| Setting | Value |
| --- | --- |
| Root directory | repository root (the build needs the workspace manifests) |
| Builder | Dockerfile |
| Dockerfile path | `deploy/audio-worker.Dockerfile` |
| Cron schedule | `*/5 * * * *` to start with |
| Restart policy | **off** |

The restart policy matters. A finished batch exits 0, and a service set to
restart will read that as a crash and start another immediately, turning a cron
job into a hot loop.

Five minutes is a starting point, not a finding. It is the longest an artist
waits before processing begins, and the shortest interval worth paying for at
beta volume. Shorten it when uploads are frequent enough to warrant it.

### Variables

| Variable | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | same project as the web app |
| `SUPABASE_SERVICE_ROLE_KEY` | unrestricted database access — see below |
| `R2_ACCOUNT_ID` | |
| `R2_ACCESS_KEY_ID` | needs object read **and write** |
| `R2_SECRET_ACCESS_KEY` | |
| `R2_MASTERS_BUCKET` | optional; defaults to `visamp-masters` |
| `R2_MEDIA_BUCKET` | optional; defaults to `media-visamp-io` |

R2 charges no egress, so pulling masters to Railway costs nothing.

`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security entirely and Supabase
has no narrower variant. Putting it here widens the blast radius beyond Vercel.
That is a deliberate trade for beta, not an oversight.

### Exit codes

A run exits **0** when the batch completes, including when individual tracks
were rejected — an unusable master is a fact about that upload, recorded on its
row for an admin to see, not a broken worker. Alerting on it would mean every
run went red and the alert stopped meaning anything.

A run exits **1** when the worker itself cannot do its job: FFmpeg missing,
credentials absent or wrong, the database unreachable. That is worth waking up
for.

### Checking it locally

```sh
docker build -f deploy/audio-worker.Dockerfile -t visamp-audio-worker .
docker run --rm --env-file apps/web/.env.local visamp-audio-worker
```

An empty queue prints `No queued uploads.` and exits 0. Without variables it
names the first one it is missing and exits 1.

To run the worker directly against a local checkout instead, `pnpm audio:process`
from the repository root reads `apps/web/.env.local` and needs FFmpeg on PATH.
