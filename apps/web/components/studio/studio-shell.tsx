"use client";

import { Film, Plus, WandSparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { MarketplaceStudio } from "@/components/studio/marketplace-studio";
import type { VideoSummary } from "@/lib/videos/model";
import { cn } from "@/lib/utils";

type StudioTab = "videos" | "maker";

export function StudioShell() {
  const [tab, setTab] = useState<StudioTab>("videos");
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/studio/videos", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          videos?: VideoSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Could not load videos.");
        if (active) setVideos(payload.videos ?? []);
      })
      .catch((cause) => {
        if (active) {
          setVideos([]);
          setError(
            cause instanceof Error ? cause.message : "Could not load videos.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function createVideo() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/studio/videos", { method: "POST" });
      const payload = (await response.json()) as {
        video?: VideoSummary;
        error?: string;
      };
      if (!response.ok || !payload.video)
        throw new Error(payload.error ?? "Could not create a video.");
      setVideos((current) => [payload.video!, ...(current ?? [])]);
      setActiveVideoId(payload.video.id);
      setTab("maker");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create a video.",
      );
    } finally {
      setCreating(false);
    }
  }

  function openVideo(id: string) {
    setActiveVideoId(id);
    setTab("maker");
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Visamp Studio"
        className="mb-6 flex gap-1 border-b"
      >
        <Tab
          active={tab === "videos"}
          icon={<Film className="h-4 w-4" />}
          onClick={() => setTab("videos")}
        >
          My Videos
        </Tab>
        <Tab
          active={tab === "maker"}
          icon={<WandSparkles className="h-4 w-4" />}
          onClick={() => setTab("maker")}
        >
          Video Maker
        </Tab>
      </div>

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {tab === "videos" ? (
        <MyVideos
          videos={videos}
          creating={creating}
          onCreate={() => void createVideo()}
          onOpen={openVideo}
        />
      ) : (
        <section role="tabpanel" aria-label="Video Maker">
          <div className="mb-6">
            <p className="site-eyebrow">VIDEO MAKER</p>
            <h1>Build a video around your music.</h1>
            <p className="max-w-3xl">
              Use your tracks with public, protected and product visuals.
              Creator-defined Visript params are the customisation surface.
            </p>
          </div>
          <MarketplaceStudio videoId={activeVideoId} />
        </section>
      )}
    </div>
  );
}

function Tab({
  active,
  icon,
  children,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function MyVideos({
  videos,
  creating,
  onCreate,
  onOpen,
}: {
  videos: VideoSummary[] | null;
  creating: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section role="tabpanel" aria-label="My Videos">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="site-eyebrow">MY VIDEOS</p>
          <h1>Your visual releases.</h1>
          <p className="max-w-3xl">
            Create, edit and preview videos here. Distribution and scheduling
            state stay attached to the video as the publishing pipeline grows.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="site-button inline-flex items-center gap-2 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          {creating ? "Creating…" : "Create video"}
        </button>
      </div>

      {videos === null ? (
        <p className="text-sm text-muted-foreground">Loading videos…</p>
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Film className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-medium">No videos yet</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            Start in Video Maker by pairing one of your tracks with an eligible
            visualisation.
          </p>
          <button type="button" onClick={onCreate} className="site-button mt-5">
            Create your first video
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <button
              key={video.id}
              type="button"
              onClick={() => onOpen(video.id)}
              className="rounded-xl border p-4 text-left transition hover:border-foreground/40 hover:bg-foreground/[0.03]"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="truncate font-medium">{video.title}</h2>
                <span className="rounded-full border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
                  {video.status}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Distribution</dt>
                  <dd className="mt-1">{stateLabel(video.distributionState)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Schedule</dt>
                  <dd className="mt-1">{stateLabel(video.scheduleState)}</dd>
                </div>
              </dl>
              <p className="mt-4 text-xs text-muted-foreground">
                Updated {new Date(video.updatedAt).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function stateLabel(state: Record<string, unknown>): string {
  const status = state.status;
  return typeof status === "string" && status ? status : "Not set";
}
