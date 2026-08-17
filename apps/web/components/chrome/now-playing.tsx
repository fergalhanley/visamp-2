"use client";

import { GitFork, Heart, Maximize, MessageCircle, Minimize, Share2 } from "lucide-react";
import Link from "next/link";

import { CreateVisButton } from "@/components/chrome/create-vis-button";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useChromeStore } from "@/lib/store/chrome";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

/**
 * E2.6 / E2.7 — the title cluster. Social affordances are visible to everyone,
 * logged in or not (principle 5); they gate on click once auth exists.
 */
export function NowPlaying() {
  const visible = useChromeStore((s) => s.visible);
  const current = useSessionStore((s) => s.current);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  // No auth yet, so nobody owns anything — E2.7's "Open in editor" variant is
  // wired but unreachable until E5 lands.
  const isOwner = false;

  return (
    <div
      className={cn(
        "group fixed left-1/2 top-6 z-40 -translate-x-1/2",
        "transition-opacity duration-500",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="flex items-start gap-3">
      <div className="visamp-surface rounded-full border py-2 pl-5 pr-3 text-center">
        {/* Fullscreen rides the always-visible line, right-aligned: it is a
            primary action for a full-viewport player and should not need
            hunting for behind a hover. */}
        <div className="flex items-center gap-3">
          <p className="text-sm">
            <Link
              href={`/vis/${current.id}`}
              className="font-medium hover:underline"
            >
              {current.title}
            </Link>
            <span className="text-muted-foreground"> — </span>
            <Link
              href={`/artist/${current.artist.username}`}
              className="text-muted-foreground hover:underline"
            >
              {current.artist.displayName}
            </Link>
          </p>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className={cn(
              "-mr-0.5 shrink-0 rounded-full p-1.5 text-muted-foreground",
              "transition hover:bg-foreground/10 hover:text-foreground",
            )}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Second line reveals on hover of the cluster. */}
        <div
          className={cn(
            "grid grid-rows-[0fr] transition-all duration-300",
            "group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]",
          )}
        >
          <div className="overflow-hidden">
            <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
              <button type="button" className="flex items-center gap-1 hover:text-foreground">
                <Heart className="h-3.5 w-3.5" />
                {current.likeCount}
              </button>
              <button type="button" className="flex items-center gap-1 hover:text-foreground">
                <MessageCircle className="h-3.5 w-3.5" />
                {current.commentCount}
              </button>
              {/* Target is /edit/<id>, which arrives with E6. */}
              <button type="button" className="flex items-center gap-1 hover:text-foreground">
                <GitFork className="h-3.5 w-3.5" />
                {isOwner ? "Open in editor" : current.forkCount}
              </button>
              <button type="button" className="flex items-center gap-1 hover:text-foreground">
                <Share2 className="h-3.5 w-3.5" />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

        <CreateVisButton />
      </div>
    </div>
  );
}
