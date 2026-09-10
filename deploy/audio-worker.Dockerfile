# VIS-87 — the audio processing worker, for Railway.
#
# Its own image rather than a shared Nixpacks config, because the validation
# service on Railway is configured from the dashboard with no config in this
# repo: anything added at the root that Nixpacks reads would change that
# service's build too. Point the worker service at this file and nothing else
# moves.
#
# The worker is a scheduled batch, not a server. It claims at most ten jobs,
# processes them and exits, which is what a cron service wants. Set the schedule
# on the Railway service and leave the restart policy off, or a finished batch
# looks like a crash and starts again immediately.
#
# Build context is the repository root:
#   docker build -f deploy/audio-worker.Dockerfile .

FROM node:22-alpine

# ffmpeg transcodes, ffprobe inspects. The worker refuses to start without
# both, which is the kind of failure a schedule should shout about. Alpine's
# build carries libopus and aac, which is all the pipeline asks for, and halves
# the image against Debian slim — 455 MB rather than 984 MB, which a cron
# service pulls on every cold start.
RUN apk add --no-cache ffmpeg ca-certificates

RUN corepack enable

WORKDIR /app

# Only the worker's own manifest. It depends on two libraries; installing the
# web app's tree instead pulls Next, React and Playwright — 632 packages, which
# exhausted the builder's memory outright and would have been a slow, enormous
# image for a script that imports an S3 client and a database client.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/audio-worker/package.json services/audio-worker/

RUN pnpm install --frozen-lockfile --filter @visamp/audio-worker --prod

COPY services/audio-worker/scripts services/audio-worker/scripts

WORKDIR /app/services/audio-worker

# Railway injects the variables, so there is no .env.local to read here.
CMD ["node", "scripts/process-audio-uploads.mjs"]
