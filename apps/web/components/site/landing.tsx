"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- player and artist preview use a singleton WASM canvas that requires a fresh document */
import Image from "next/image";
import { ArrowDown, ArrowUpRight, Eye, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { VisampCanvas } from "@visamp/player";
import { SiteFooter, SiteHeader } from "@/components/site/site-header";

import type { GalleryPage } from "@/lib/gallery";
import {cn} from "@/lib/utils.ts";
export function Landing({
  initial,
  initialError,
  heroSource,
}: {
  initial: GalleryPage;
  initialError: string | null;
  /** The hero script, fetched per request. Null when it could not be loaded. */
  heroSource: string | null;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [page, setPage] = useState(initial);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const scrollRoot = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    const abort = new AbortController();
    controller.current = abort;
    try {
      const response = await fetch(
        "/api/gallery" +
          (page.next ? "?cursor=" + encodeURIComponent(page.next) : ""),
        { signal: abort.signal },
      );
      if (!response.ok)
        throw new Error("The gallery could not be loaded. Please try again.");
      const next = (await response.json()) as GalleryPage;
      setPage((previous) => ({
        items: [
          ...previous.items,
          ...next.items.filter(
            (item) =>
              !previous.items.some((existing) => existing.id === item.id),
          ),
        ],
        next: next.next,
      }));
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      busy.current = false;
      if (!abort.signal.aborted) setLoading(false);
    }
  }, [page.next]);
  useEffect(() => () => controller.current?.abort(), []);

  useEffect(() => {
    if (!page.next || error || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load();
      },
      { root: scrollRoot.current, rootMargin: "500px" },
    );
    if (sentinel.current) observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [page.next, error, loading, load]);
  return (
    <div
      className="site-page landing"
      ref={scrollRoot}
      onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 24)}
    >
      <SiteHeader visible={scrolled} />
      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          {/* The engine drawing the mark, rather than a picture of it. No
              controls and no analyser: it is scenery, not the player. Safe to
              mount here because CanvasLayer only runs on player routes, and
              every link off this page is a full document navigation — the WASM
              module is a singleton bound to one stage element. */}
          {heroSource && (
            <VisampCanvas
              source={heroSource}
              active
              analyser={null}
              className="hero-canvas"
            />
          )}
          <div className="hero-orbit orbit-one" aria-hidden="true" />
          <div className="hero-orbit orbit-two" aria-hidden="true" />
          <div className="hero-grid" aria-hidden="true" />
          <div className="hero-content">
            <div className="hero-title">
              <img
                  src="/visamp-title.svg"
                  alt="VisAmp"
                  className={cn("h-5 w-auto mix-blend-screen", "hero-title-image")}
              />
            </div>
            <h1 id="landing-title" className="sr-only">
              A VISION OF MUSIC
            </h1>
            <p className="hero-tagline" aria-hidden="true">
              A VISION OF MUSIC
            </p>
            <p className="hero-description">
              Turn up the sound. Get lost in the visuals.
              <br />A world of music and motion, made by you.
            </p>
            <div className="hero-actions">
              <a className="site-button primary" href="/player">
                <Play size={16} fill="currentColor" /> Play Now
              </a>
              <a className="site-button secondary" href="#discover">
                Discover <ArrowDown size={16} />
              </a>
            </div>
          </div>
        </section>
        <section
          id="discover"
          className="landing-gallery"
          aria-labelledby="gallery-title"
        >
          <div className="gallery-heading">
            <div>
              <p className="site-eyebrow">THE COMMUNITY IN MOTION</p>
              <h2 id="gallery-title">Find your frequency.</h2>
              <p>Original visualisations. Endless ways to see sound.</p>
            </div>
            <a href="/artists">
              Meet the artists <ArrowUpRight size={16} />
            </a>
          </div>
          <div className="gallery-grid">
            {page.items.map((item, index) => (
              <article className="gallery-card" key={item.id}>
                <a
                  href={"/vis/" + item.id}
                  className={"gallery-art art-" + (index % 6)}
                  aria-label={"Play " + item.title}
                >
                  {item.thumbnail ? (
                    <Image
                      src={item.thumbnail}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1000px) 50vw, 33vw"
                    />
                  ) : (
                    <div className="art-pattern" aria-hidden="true" />
                  )}
                  <span className="gallery-play">
                    <Play fill="currentColor" size={22} />
                  </span>
                  {!item.thumbnail && (
                    <span className="art-label">
                      VISAMP / GENERATIVE VISUAL
                    </span>
                  )}
                </a>
                <div className="gallery-card-info">
                  <div>
                    <h3>
                      <a href={"/vis/" + item.id}>{item.title}</a>
                    </h3>
                    {item.username ? (
                      <a
                        className="gallery-artist"
                        href={"/artists/" + item.username}
                      >
                        @{item.username}
                      </a>
                    ) : (
                      <span className="gallery-artist">Unknown artist</span>
                    )}
                  </div>
                  <span className="gallery-views">
                    <Eye size={13} />
                    {new Intl.NumberFormat("en", {
                      notation: "compact",
                    }).format(item.views)}
                    <span className="sr-only"> views</span>
                  </span>
                </div>
              </article>
            ))}
          </div>
          {!page.items.length && !error && (
            <div className="gallery-empty">
              <h3>A new world starts here.</h3>
              <p>The community’s first visualisations will appear here.</p>
              <a className="site-button secondary" href="/player">
                Explore the player
              </a>
            </div>
          )}
          <div ref={sentinel} className="gallery-more" aria-live="polite">
            {error && <p role="alert">{error}</p>}
            {(page.next || error) && (
              <button
                className="site-button secondary"
                onClick={() => void load()}
                disabled={loading}
              >
                {loading
                  ? "Loading visuals…"
                  : error
                    ? "Try again"
                    : "Load more visuals"}
              </button>
            )}
            {!page.next && !!page.items.length && (
              <p>You’re all caught up. More imagination is on its way.</p>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
