"use client";

import {
  VisampCanvas,
  type ExternalParamValue,
  type ParamView,
  type VisampCanvasHandle,
} from "@visamp/player";
import { Download, Pause, Play, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useAnalyser } from "@/hooks/use-analyser";
import { useMarketplaceVisualisations } from "@/hooks/use-marketplace-visualisations";
import { useVisualisationAssets } from "@/hooks/use-visualisation-assets";
import { getAudioEngine } from "@/lib/audio/audio-engine";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
import {
  downloadRecordedVideo,
  recordVideo,
} from "@/lib/studio/export-video";
import { useAudioStore, wireAudioEvents } from "@/lib/store/audio";
import type { Visualisation } from "@/lib/types";
import { cn } from "@/lib/utils";

type TracksState = {
  tracks: HostedTrackSummary[];
  error: string | null;
} | null;

function paramValue(param: ParamView): ExternalParamValue | undefined {
  if (param.type === "integer" || param.type === "float") {
    const value = Number(param.value);
    return Number.isFinite(value) ? value : undefined;
  }
  if (param.type === "boolean") return param.value === "true";
  if (param.type === "color") return param.swatch ?? undefined;
  if (param.type === "string") {
    try {
      const value = JSON.parse(param.value);
      return typeof value === "string" ? value : param.value;
    } catch {
      return param.value.replace(/^"|"$/g, "");
    }
  }
  return undefined;
}

export function MarketplaceStudio() {
  const { user } = useAuth();
  const [signIn, setSignIn] = useState(false);
  const [tracksState, setTracksState] = useState<TracksState>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedVisualId, setSelectedVisualId] = useState<string | null>(null);
  const [params, setParams] = useState<ParamView[]>([]);
  const [overrides, setOverrides] = useState<{
    visualId: string | null;
    values: Record<string, ExternalParamValue>;
  }>({ visualId: null, values: {} });
  const [previewError, setPreviewError] = useState("");
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const [purchase, setPurchase] = useState<{
    loading: boolean;
    licenceId: string | null;
    message: string;
  }>({ loading: false, licenceId: null, message: "" });
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  const canvas = useRef<VisampCanvasHandle>(null);
  const analyser = useAnalyser();
  const marketplace = useMarketplaceVisualisations();
  const isPlaying = useAudioStore((state) => state.isPlaying);
  const position = useAudioStore((state) => state.position);
  const duration = useAudioStore((state) => state.duration);
  const audioError = useAudioStore((state) => state.hostedError);
  const togglePlay = useAudioStore((state) => state.togglePlay);
  const seek = useAudioStore((state) => state.seek);

  useEffect(() => {
    wireAudioEvents();
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetch("/api/billing", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as { available?: number };
        if (active && response.ok && typeof payload.available === "number")
          setAvailableCredits(payload.available);
      })
      .catch(() => {});

    void fetch("/api/studio/tracks", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          tracks?: HostedTrackSummary[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Could not load your tracks.");
        if (active)
          setTracksState({ tracks: payload.tracks ?? [], error: null });
      })
      .catch((error) => {
        if (active)
          setTracksState({
            tracks: [],
            error:
              error instanceof Error ? error.message : "Could not load your tracks.",
          });
      });
    return () => {
      active = false;
    };
  }, [user]);

  const tracks = tracksState?.tracks ?? [];
  const selectedTrack =
    tracks.find((track) => track.id === selectedTrackId) ?? null;
  const selectedVisual =
    marketplace.items.find((vis) => vis.id === selectedVisualId) ??
    marketplace.items[0] ??
    null;

  const { assets, preparation } = useVisualisationAssets(
    selectedVisual?.source ?? "",
    selectedVisual?.id,
  );

  async function selectTrack(track: HostedTrackSummary) {
    setSelectedTrackId(track.id);
    setPurchase({ loading: false, licenceId: null, message: "" });
    setExportMessage("");
    setPreviewError("");
    try {
      await useAudioStore.getState().playHostedSelection(track.id, [track]);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Could not play that track.",
      );
    }
  }

  function selectVisual(vis: Visualisation) {
    setSelectedVisualId(vis.id);
    setParams([]);
    setOverrides({ visualId: vis.id, values: {} });
    setPurchase({ loading: false, licenceId: null, message: "" });
    setExportMessage("");
    setPreviewError("");
  }

  function applyParam(
    param: ParamView,
    value: ExternalParamValue,
  ) {
    if (!selectedVisual) return;
    try {
      canvas.current?.setParam(param.name, value);
      setOverrides((current) => ({
        visualId: selectedVisual.id,
        values: {
          ...(current.visualId === selectedVisual.id ? current.values : {}),
          [param.name]: value,
        },
      }));
      setPreviewError("");
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Could not update the visual.",
      );
    }
  }

  async function licenseVisual() {
    if (!selectedTrack || !selectedVisual || purchase.loading) return;

    setPurchase({ loading: true, licenceId: null, message: "" });
    try {
      const response = await fetch("/api/studio/licences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: selectedTrack.id,
          visualisationId: selectedVisual.id,
          paramValues: activeOverrides,
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        status?: string;
        licenceId?: string;
        availableCredits?: number;
        requiredCredits?: number;
      };
      if (!response.ok) {
        if (response.status === 402) {
          throw new Error(
            `Not enough credits. This visual costs ${result.requiredCredits ?? selectedVisual.marketplacePriceCredits ?? "more"} credits.`,
          );
        }
        throw new Error(result.error ?? "Could not license this visual.");
      }

      if (typeof result.availableCredits === "number")
        setAvailableCredits(result.availableCredits);

      setPurchase({
        loading: false,
        licenceId: result.licenceId ?? null,
        message:
          result.status === "existing"
            ? "Already licensed for this track."
            : "Licensed. This visual is ready to export.",
      });
    } catch (error) {
      setPurchase({
        loading: false,
        licenceId: null,
        message:
          error instanceof Error ? error.message : "Could not license this visual.",
      });
    }
  }

  async function exportClip() {
    if (
      !selectedTrack ||
      !selectedVisual ||
      !purchase.licenceId ||
      !canvas.current ||
      exporting
    )
      return;

    setExporting(true);
    setExportMessage("Preparing 9:16 export…");
    try {
      // Let the canvas ResizeObserver settle after switching to portrait.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      if (!useAudioStore.getState().isPlaying)
        await useAudioStore.getState().togglePlay();

      const remainingSeconds =
        useAudioStore.getState().duration > 0
          ? Math.max(
              1,
              useAudioStore.getState().duration -
                useAudioStore.getState().position,
            )
          : 15;
      const seconds = Math.min(15, remainingSeconds);

      setExportMessage(`Recording ${Math.round(seconds)} seconds…`);
      const recorded = await recordVideo(
        canvas.current.captureStream(30),
        getAudioEngine().getRecordingStream(),
        seconds * 1000,
      );
      const stem = `${selectedTrack.artist}-${selectedTrack.title}-visamp`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 100);

      downloadRecordedVideo(recorded, stem || "visamp-export");
      setExportMessage("Export ready.");
    } catch (error) {
      setExportMessage(
        error instanceof Error ? error.message : "Video export failed.",
      );
    } finally {
      setExporting(false);
    }
  }

  const controls = params.filter((param) =>
    ["integer", "float", "boolean", "color", "string"].includes(param.type),
  );
  const activeOverrides =
    overrides.visualId === selectedVisual?.id ? overrides.values : {};

  if (!user) {
    return (
      <section className="rounded-xl border p-8 text-center">
        <h2 className="text-xl font-semibold">Bring one of your tracks.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to audition creator visuals against music you control.
        </p>
        <button
          type="button"
          className="site-button mt-5"
          onClick={() => setSignIn(true)}
        >
          Sign in
        </button>
        <SignInDialog open={signIn} onOpenChange={setSignIn} />
      </section>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)_18rem]">
      <aside className="min-w-0 rounded-xl border bg-background/60">
        <header className="border-b p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            1 · Your track
          </p>
          <h2 className="mt-1 font-semibold">Choose music</h2>
        </header>
        <div className="max-h-[65vh] overflow-y-auto p-2">
          {tracksState === null ? (
            <p className="p-3 text-sm text-muted-foreground">Loading your music…</p>
          ) : tracksState.error ? (
            <p className="p-3 text-sm text-destructive">{tracksState.error}</p>
          ) : tracks.length === 0 ? (
            <div className="p-3 text-sm">
              <p className="text-muted-foreground">
                Upload a track before building its visual release.
              </p>
              <a
                href="/upload"
                className="mt-4 inline-flex items-center gap-2 underline"
              >
                <Upload className="h-4 w-4" />
                Upload music
              </a>
            </div>
          ) : (
            tracks.map((track) => (
              <button
                key={track.id}
                type="button"
                onClick={() => void selectTrack(track)}
                className={cn(
                  "mb-1 block w-full rounded-lg p-3 text-left transition",
                  selectedTrackId === track.id
                    ? "bg-foreground text-background"
                    : "hover:bg-foreground/10",
                )}
              >
                <span className="block truncate text-sm font-medium">
                  {track.title}
                </span>
                <span className="block truncate text-xs opacity-70">
                  {track.artist}
                </span>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="overflow-hidden rounded-xl border bg-black">
          <div
            className={cn(
              "mx-auto transition-[aspect-ratio,width] duration-200",
              exporting ? "aspect-[9/16] h-[70vh] max-h-[900px]" : "aspect-video w-full",
            )}
          >
            {selectedVisual ? (
              <VisampCanvas
                ref={canvas}
                source={selectedVisual.source}
                assets={assets}
                assetPreparation={preparation}
                posterUrl={selectedVisual.thumbUrl}
                active
                analyser={analyser}
                onParams={setParams}
                onLog={(entry) => {
                  if (entry.level === "error") setPreviewError(entry.message);
                }}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/60">
                No marketplace visuals yet.
              </div>
            )}
          </div>
          <footer className="flex min-h-14 items-center gap-3 border-t border-white/10 bg-[#0c0f0f] px-4 text-white">
            {selectedTrack ? (
              <>
                <button
                  type="button"
                  onClick={() => void togglePlay()}
                  className="rounded-full border border-white/20 p-2"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {selectedTrack.title}
                  </p>
                  <p className="truncate text-xs text-white/60">
                    {selectedTrack.artist}
                  </p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(duration, 1)}
                  step={0.1}
                  value={Math.min(position, Math.max(duration, 1))}
                  onChange={(event) => seek(Number(event.target.value))}
                  className="ml-auto min-w-24 flex-1"
                  aria-label="Track position"
                />
              </>
            ) : (
              <p className="text-sm text-white/60">
                Choose one of your tracks to hear it with these visuals.
              </p>
            )}
          </footer>
        </div>

        {(previewError || audioError) && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {previewError || audioError}
          </p>
        )}

        <div className="mt-5">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                2 · Visual
              </p>
              <h2 className="mt-1 font-semibold">Audition creator work</h2>
            </div>
            {selectedVisual?.marketplacePriceCredits ? (
              <span className="text-sm text-muted-foreground">
                {selectedVisual.marketplacePriceCredits} credits
              </span>
            ) : null}
          </div>

          {marketplace.loading ? (
            <p className="text-sm text-muted-foreground">Loading visuals…</p>
          ) : marketplace.error ? (
            <p className="text-sm text-destructive">{marketplace.error}</p>
          ) : marketplace.items.length === 0 ? (
            <p className="rounded-xl border p-5 text-sm text-muted-foreground">
              No creator visuals are listed yet. List one from the visual editor
              to seed the prototype marketplace.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {marketplace.items.map((vis) => (
                <button
                  key={vis.id}
                  type="button"
                  onClick={() => selectVisual(vis)}
                  className={cn(
                    "overflow-hidden rounded-xl border text-left transition",
                    selectedVisual?.id === vis.id
                      ? "ring-2 ring-foreground"
                      : "hover:border-foreground/40",
                  )}
                >
                  <div
                    className="aspect-video bg-black bg-cover bg-center"
                    style={
                      vis.thumbUrl
                        ? { backgroundImage: `url("${vis.thumbUrl}")` }
                        : undefined
                    }
                  />
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{vis.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {vis.creator.username} · {vis.marketplacePriceCredits} credits
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <aside className="min-w-0 rounded-xl border bg-background/60">
        <header className="border-b p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            3 · Customise
          </p>
          <h2 className="mt-1 font-semibold">Make it yours</h2>
        </header>
        <div className="space-y-5 p-4">
          {!selectedVisual ? (
            <p className="text-sm text-muted-foreground">Choose a visual first.</p>
          ) : controls.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This creator has not exposed any controls.
            </p>
          ) : (
            controls.map((param) => {
              const initial = paramValue(param);
              const value = activeOverrides[param.name] ?? initial;

              if (param.type === "boolean") {
                return (
                  <label
                    key={param.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{param.name}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(event) =>
                        applyParam(param, event.target.checked)
                      }
                    />
                  </label>
                );
              }

              if (param.type === "color") {
                return (
                  <label key={param.name} className="block text-sm">
                    <span className="mb-2 block">{param.name}</span>
                    <input
                      type="color"
                      value={
                        typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
                          ? value
                          : "#ffffff"
                      }
                      onChange={(event) =>
                        applyParam(param, event.target.value)
                      }
                      className="h-10 w-full"
                    />
                  </label>
                );
              }

              if (param.type === "string") {
                return (
                  <label key={param.name} className="block text-sm">
                    <span className="mb-2 block">{param.name}</span>
                    <input
                      type="text"
                      value={typeof value === "string" ? value : ""}
                      onChange={(event) =>
                        applyParam(param, event.target.value)
                      }
                      className="w-full rounded-md border bg-transparent px-3 py-2"
                    />
                  </label>
                );
              }

              return (
                <label key={param.name} className="block text-sm">
                  <span className="mb-2 block">{param.name}</span>
                  <input
                    type="number"
                    value={typeof value === "number" ? value : ""}
                    min={undefined}
                    max={undefined}
                    step="any"
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next)) applyParam(param, next);
                    }}
                    className="w-full rounded-md border bg-transparent px-3 py-2"
                  />
                </label>
              );
            })
          )}

          {selectedVisual && (
            <>
              <div className="border-t pt-4 text-xs text-muted-foreground">
                Visual by{" "}
                <span className="text-foreground">
                  {selectedVisual.creator.username}
                </span>
              </div>

              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Your credits</span>
                  <span>{availableCredits ?? "—"}</span>
                </div>
                <button
                  type="button"
                  disabled={!selectedTrack || purchase.loading}
                  onClick={() => void licenseVisual()}
                  className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background disabled:opacity-40"
                >
                  {purchase.loading
                    ? "Licensing…"
                    : `License for ${selectedVisual.marketplacePriceCredits ?? "—"} credits`}
                </button>
                {!selectedTrack && (
                  <p className="text-xs text-muted-foreground">
                    Choose one of your tracks first.
                  </p>
                )}
                {purchase.message && (
                  <p
                    role="status"
                    className={cn(
                      "text-xs",
                      purchase.licenceId
                        ? "text-emerald-500"
                        : "text-muted-foreground",
                    )}
                  >
                    {purchase.message}
                  </p>
                )}
                {purchase.licenceId && (
                  <button
                    type="button"
                    disabled={exporting}
                    onClick={() => void exportClip()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium disabled:opacity-40"
                  >
                    <Download className="h-4 w-4" />
                    {exporting ? "Recording…" : "Export 15s vertical clip"}
                  </button>
                )}
                {exportMessage && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {exportMessage}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
