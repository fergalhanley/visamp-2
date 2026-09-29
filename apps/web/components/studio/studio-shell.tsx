"use client";

import { Film, Plus, WandSparkles } from "lucide-react";
import { useState } from "react";

import { MarketplaceStudio } from "@/components/studio/marketplace-studio";
import { cn } from "@/lib/utils";

type StudioTab = "videos" | "maker";

export function StudioShell() {
  const [tab, setTab] = useState<StudioTab>("videos");

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

      {tab === "videos" ? (
        <MyVideosEmpty onCreate={() => setTab("maker")} />
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
          <MarketplaceStudio />
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

function MyVideosEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <section role="tabpanel" aria-label="My Videos">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="site-eyebrow">MY VIDEOS</p>
          <h1>Your visual releases.</h1>
          <p className="max-w-3xl">
            Videos you create in Visamp will live here with their edit,
            preview, distribution and scheduling state.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreate}
          className="site-button inline-flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create video
        </button>
      </div>

      <div className="rounded-xl border border-dashed p-10 text-center">
        <Film className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">No videos yet</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Start in Video Maker by pairing one of your tracks with a visual.
          Saved and exported videos will appear here.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="site-button mt-5"
        >
          Create your first video
        </button>
      </div>
    </section>
  );
}
