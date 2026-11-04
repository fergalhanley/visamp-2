"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VisampCanvas } from "@visamp/player";
import { useEmbedAssets } from "@/hooks/use-embed-assets";
import {
  EMBED_CHANNEL,
  EMBED_VERSION,
  isHostState,
  type EmbedEventType,
  type EmbedMode,
} from "@/lib/embed/protocol";
import type { EmbedVisual } from "@/lib/embed/examples";
import { SITE_URL } from "@/lib/seo";
import "./embed.css";

export function EmbedPlayer({
  visuals,
  initialId,
  mode,
  parentOrigin,
  instance,
}: {
  visuals: EmbedVisual[];
  initialId: string;
  mode: EmbedMode;
  parentOrigin: string | null;
  instance: string;
}) {
  const [selectedId, setSelectedId] = useState(initialId);
  const selected =
    visuals.find((visual) => visual.id === selectedId) ?? visuals[0]!;
  const [playing, setPlaying] = useState(mode === "ambient");
  const [hostActive, setHostActive] = useState(!parentOrigin);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(true);
  const [manualPlay, setManualPlay] = useState(false);
  const [error, setError] = useState("");
  const [fullscreenError, setFullscreenError] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const readyFor = useRef<string | null>(null);
  const { assets, preparation } = useEmbedAssets(selected.source, selected.id);
  const wantsPlay = playing && (!reduced || manualPlay);
  const active = wantsPlay && hostActive && visible && !error;

  const send = useCallback(
    (type: EmbedEventType) => {
      if (parentOrigin && window.parent !== window)
        window.parent.postMessage(
          { channel: EMBED_CHANNEL, version: EMBED_VERSION, type, instance },
          parentOrigin,
        );
    },
    [parentOrigin, instance],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => {
      setReduced(media.matches);
      setManualPlay(false);
    };
    const updateVisibility = () => setVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    const receive = (event: MessageEvent) => {
      if (
        !parentOrigin ||
        event.origin !== parentOrigin ||
        event.source !== window.parent ||
        !isHostState(event.data) ||
        event.data.instance !== instance
      )
        return;
      setHostActive(event.data.active);
      if (event.data.active && event.data.userInitiated) {
        setManualPlay(true);
        setPlaying(true);
      }
    };
    window.addEventListener("message", receive);
    send("ready");
    return () => {
      media.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("message", receive);
    };
  }, [parentOrigin, instance, send]);

  useEffect(() => {
    if (preparation.status === "error") send("error");
  }, [preparation.status, send]);

  const choose = (id: string) => {
    setSelectedId(id);
    setError("");
    readyFor.current = null;
    setManualPlay(true);
    setPlaying(true);
  };
  const toggle = () => {
    setManualPlay(true);
    setPlaying(!wantsPlay);
  };
  const openHref = new URL(selected.href, SITE_URL).href;

  return (
    <main
      className={`visamp-embed visamp-embed-${mode}`}
      ref={root}
      aria-label="Visamp embedded player"
    >
      <div className="visamp-embed-stage">
        <VisampCanvas
          source={selected.source}
          assets={assets}
          assetPreparation={preparation}
          posterUrl={selected.poster}
          active={active}
          interactive={mode === "showcase"}
          analyser={null}
          className="visamp-embed-canvas"
          hideErrors={mode === "ambient"}
          onCompileResult={(result) => {
            if (!result.ok) {
              setError("This visualisation could not be played.");
              send("error");
            } else if (
              preparation.status === "ready" &&
              readyFor.current !== selected.id
            ) {
              readyFor.current = selected.id;
              setError("");
              send("rendered");
            }
          }}
          onLog={(entry) => {
            if (entry.level === "error") {
              setError("The player encountered a rendering error.");
              send("error");
            }
          }}
        />
        {mode === "showcase" && !wantsPlay && !error && (
          <button type="button" className="visamp-embed-start" onClick={toggle}>
            ▶ Play visualisation
          </button>
        )}
        {error && mode === "showcase" && (
          <div className="visamp-embed-error" role="alert">
            <p>{error}</p>
            <a href={openHref} target="_blank" rel="noopener noreferrer">
              Open in Visamp ↗
            </a>
          </div>
        )}
      </div>
      {mode === "showcase" && (
        <div className="visamp-embed-controls">
          <button
            type="button"
            onClick={toggle}
            aria-label={
              wantsPlay ? "Pause visualisation" : "Play visualisation"
            }
          >
            {wantsPlay ? "Ⅱ Pause" : "▶ Play"}
          </button>
          <label>
            <span className="visamp-embed-sr">Choose an example</span>
            <select
              value={selected.id}
              onChange={(event) => choose(event.target.value)}
            >
              {visuals.map((visual) => (
                <option key={visual.id} value={visual.id}>
                  {visual.title}
                </option>
              ))}
            </select>
          </label>
          <span className="visamp-embed-credit">{selected.credit}</span>
          <button
            type="button"
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else if (root.current?.requestFullscreen)
                  await root.current.requestFullscreen();
                else
                  setFullscreenError(
                    "Fullscreen is not available in this browser.",
                  );
              } catch {
                setFullscreenError(
                  "Fullscreen is not available in this browser.",
                );
              }
            }}
          >
            Fullscreen
          </button>
          <a href={openHref} target="_blank" rel="noopener noreferrer">
            Open in Visamp ↗
          </a>
          {selected.hint && (
            <p className="visamp-embed-hint">{selected.hint}</p>
          )}
          {fullscreenError && (
            <p role="status" className="visamp-embed-hint">
              {fullscreenError}
            </p>
          )}
        </div>
      )}
    </main>
  );
}
