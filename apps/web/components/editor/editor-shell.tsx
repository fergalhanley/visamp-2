"use client";

import {
  VisampCanvas,
  type CompileResult,
  type LogEntry,
  type PropertyView,
  type VisampCanvasHandle,
} from "@visamp/player";
import {
  Camera,
  Check,
  Dot,
  FilePlus,
  FolderOpen,
  GitFork,
  Loader2,
  Pin,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { barButton, barButtonBlue, barLabel } from "@/components/chrome/bar-button";
import { CreateVisButton } from "@/components/chrome/create-vis-button";
import { TopBar } from "@/components/chrome/top-bar";
import { AiPrompt } from "@/components/editor/ai-prompt";
import { CodeEditor, type CodeEditorHandle } from "@/components/editor/code-editor";
import { EditorLog, type LogLine } from "@/components/editor/editor-log";
import { OpenVisDialog } from "@/components/editor/open-vis-dialog";
import { AssetPanel } from "@/components/editor/asset-panel";
import { EditorTransport } from "@/components/editor/editor-transport";
import { PropertiesInspector } from "@/components/editor/properties-inspector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAnalyser } from "@/hooks/use-analyser";
import { useVisualisationAssets } from "@/hooks/use-visualisation-assets";
import { useFullscreen } from "@/hooks/use-fullscreen";
import type { AiModelKey, GenerationEvent } from "@/lib/ai/types";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Visualisation = Database["public"]["Tables"]["visualisations"]["Row"];
type Visibility = Database["public"]["Enums"]["visibility"];

/** E6.5 — how long to wait after the last keystroke before recompiling. */
const RECOMPILE_MS = 200;
/**
 * E6.8 — how often edits are written back, at most.
 *
 * A throttle rather than a debounce: a debounce would keep pushing the save
 * further out for as long as someone kept typing, so a long editing session
 * would never persist anything.
 */
const AUTOSAVE_MS = 8000;
const RATIO_KEY = "visamp.editor.split";
const DEFAULT_RATIO = 40;
const MIN_RATIO = 20;
const MAX_RATIO = 70;

let logSeq = 0;

function readStoredRatio(): number {
  if (typeof window === "undefined") return DEFAULT_RATIO;
  const raw = Number(window.localStorage.getItem(RATIO_KEY));
  return Number.isFinite(raw) && raw >= MIN_RATIO && raw <= MAX_RATIO ? raw : DEFAULT_RATIO;
}

interface EditorShellProps {
  /**
   * Null when nothing is open — a deleted row, a bad link, or someone else's
   * private work. The editor still renders, but as an empty stage offering the
   * two ways out of it rather than a 404.
   */
  visualisation: Visualisation | null;
  canEdit: boolean;
}

export function EditorShell({ visualisation, canEdit }: EditorShellProps) {
  const empty = visualisation === null;

  const [title, setTitle] = useState(visualisation?.title ?? "");
  const [visibility, setVisibility] = useState<Visibility>(
    visualisation?.visibility ?? "private",
  );
  const [source, setSource] = useState(visualisation?.source ?? "");
  /** Debounced copy — this is what the engine actually receives. */
  const [liveSource, setLiveSource] = useState(visualisation?.source ?? "");

  const [compile, setCompile] = useState<CompileResult | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [properties, setProperties] = useState<PropertyView[]>([]);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * The last state successfully written.
   *
   * Compared against instead of the props: the props are the server's copy from
   * page load and never change, so anything derived from them would report
   * unsaved work forever once the first edit landed.
   */
  const [lastSaved, setLastSaved] = useState({
    title: visualisation?.title ?? "",
    source: visualisation?.source ?? "",
    visibility: visualisation?.visibility ?? ("private" as Visibility),
  });

  // localStorage is read through useSyncExternalStore so the server can render
  // the default without a hydration mismatch. `override` takes over on drag.
  const storedRatio = useSyncExternalStore(
    () => () => {},
    readStoredRatio,
    () => DEFAULT_RATIO,
  );
  const [override, setOverride] = useState<number | null>(null);
  const ratio = override ?? storedRatio;

  /** When the last write completed, so the throttle can pace the next one. */
  const lastSaveAt = useRef(0);
  const editorHandle = useRef<CodeEditorHandle | null>(null);
  const canvasHandle = useRef<VisampCanvasHandle>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  // E6.10 — a pinned thumb is the author's explicit choice and survives saves.
  const analyser = useAnalyser();
  // Re-resolves only when the set of referenced ids changes, so typing around
  // an asset reference does not re-download it.
  const { assets } = useVisualisationAssets(liveSource);
  const { user } = useAuth();
  // Shares its state with the transport's button through the fullscreen API,
  // so the two never disagree about whether the preview is expanded.
  const { toggle: togglePreviewFullscreen } = useFullscreen(previewRef);
  const [thumbPinned, setThumbPinned] = useState(visualisation?.thumb_pinned ?? false);
  const [forking, setForking] = useState(false);
  const [forkBlocked, setForkBlocked] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [openPickerShown, setOpenPickerShown] = useState(false);
  const [editorTab, setEditorTab] = useState<"script" | "assets">("script");
  const [deleteShown, setDeleteShown] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const preserveNextCompileLog = useRef(false);

  // E6.5 — debounce keystrokes into the engine.
  useEffect(() => {
    const timer = window.setTimeout(() => setLiveSource(source), RECOMPILE_MS);
    return () => window.clearTimeout(timer);
  }, [source]);

  const appendLog = useCallback((entry: Omit<LogLine, "id" | "at">) => {
    setLogLines((lines) => [
      ...lines.slice(-199),
      { ...entry, id: (logSeq += 1), at: Date.now() },
    ]);
  }, []);

  /**
   * A recompile replaces the log rather than adding to it. The previous run's
   * errors point at source that no longer exists, and leaving them stacked
   * above the current ones is how you end up chasing a bug you already fixed.
   * Runtime entries from `onLog` then accumulate under the fresh compile line.
   */
  const onCompileResult = useCallback((result: CompileResult) => {
    setCompile(result);

    const at = Date.now();
    const next = result.ok
      ? [{ id: (logSeq += 1), level: "info" as const, message: "Compiled.", at }]
      : result.diagnostics.map((diagnostic) => ({
          id: (logSeq += 1),
          level: "error" as const,
          message: diagnostic.message,
          line: diagnostic.line,
          at,
        }));
    if (preserveNextCompileLog.current) {
      preserveNextCompileLog.current = false;
      setLogLines((lines) => [...lines.slice(-199 + next.length), ...next]);
    } else {
      setLogLines(next);
    }

    // E6.6 — errors force the log open.
    if (!result.ok) setLogCollapsed(false);
  }, []);

  const generate = useCallback(
    async (prompt: string, model: AiModelKey) => {
      if (!visualisation || generating) return;
      setGenerating(true);
      setLogCollapsed(false);
      appendLog({ level: "info", message: "Sending prompt…" });

      try {
        const response = await fetch("/api/ai/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt, source, visId: visualisation.id, model }),
        });
        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? `Generation failed (${response.status})`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        while (true) {
          const { done, value } = await reader.read();
          buffered += decoder.decode(value, { stream: !done });
          const lines = buffered.split("\n");
          buffered = done ? "" : (lines.pop() ?? "");
          for (const raw of lines) {
            if (!raw.trim()) continue;
            const event = JSON.parse(raw) as GenerationEvent;
            if (event.type === "status") {
              appendLog({ level: event.level ?? "info", message: event.message });
            } else if (event.type === "success") {
              preserveNextCompileLog.current = true;
              editorHandle.current?.replaceDocument(event.source);
              setSource(event.source);
              setLiveSource(event.source);
              appendLog({ level: "info", message: event.message });
            } else if (event.type === "exhausted") {
              appendLog({ level: "warn", message: event.message });
              if (event.diagnostics) appendLog({ level: "error", message: event.diagnostics });
            } else {
              appendLog({ level: "error", message: event.message });
            }
          }
          if (done) break;
        }
      } catch (error) {
        appendLog({
          level: "error",
          message: error instanceof Error ? error.message : "Generation failed",
        });
      } finally {
        setGenerating(false);
      }
    },
    [appendLog, generating, source, visualisation],
  );

  const onLog = useCallback(
    (entry: LogEntry) => {
      appendLog({ level: entry.level, message: entry.message, line: entry.line });
      if (entry.level === "error") setLogCollapsed(false);
    },
    [appendLog],
  );

  // ── Split handle ──────────────────────────────────────────────────────────

  const onDragMove = useCallback((event: PointerEvent) => {
    if (!dragging.current || !splitRef.current) return;

    const bounds = splitRef.current.getBoundingClientRect();
    const next = ((event.clientX - bounds.left) / bounds.width) * 100;
    setOverride(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)));
  }, []);

  const stopDrag = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    document.body.style.userSelect = "";
    setOverride((current) => {
      if (current !== null) {
        window.localStorage.setItem(RATIO_KEY, String(Math.round(current)));
      }
      return current;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", stopDrag);
    return () => {
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", stopDrag);
    };
  }, [onDragMove, stopDrag]);

  // ── Save ──────────────────────────────────────────────────────────────────

  const dirty =
    source !== lastSaved.source ||
    title !== lastSaved.title ||
    visibility !== lastSaved.visibility;

  // E6.8 — nothing is written from a script that does not compile.
  const canSave = !empty && canEdit && dirty && compile?.ok === true && !saving;

  /**
   * Captures the current frame at a fixed 1280x720 and stores it under
   * <owner>/<vis>.png — a stable key, so re-capturing replaces rather than
   * accumulating. The returned URL carries a cache-buster because of that.
   */
  const uploadThumbnail = useCallback(async (): Promise<string | null> => {
    const handle = canvasHandle.current;
    if (!handle || !visualisation) return null;

    const blob = await handle.captureFrame();
    const path = `${visualisation.owner_id}/${visualisation.id}.png`;
    const supabase = createClient();

    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(path, blob, { contentType: "image/png", upsert: true });

    if (error) throw new Error(error.message);

    return path;
  }, [visualisation]);

  const captureThumbnail = useCallback(async () => {
    if (!visualisation) return;

    setCapturing(true);
    setSaveError(null);

    try {
      const thumbPath = await uploadThumbnail();
      if (thumbPath) {
        const { error } = await createClient()
          .from("visualisations")
          .update({ thumb_path: thumbPath, thumb_pinned: true })
          .eq("id", visualisation.id);

        if (error) throw new Error(error.message);
        setThumbPinned(true);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Capture failed");
    }

    setCapturing(false);
  }, [uploadThumbnail, visualisation]);

  const save = useCallback(async () => {
    if (!visualisation) return;

    // Snapshotted before the first await. Whatever is typed while the write is
    // in flight must stay dirty, or those keystrokes would be marked saved
    // without ever having been sent.
    const snapshot = { title, source, visibility };

    setSaving(true);
    setSaveError(null);

    // E6.10 — an unpinned thumb is refreshed from the current frame on save.
    // A thumbnail failure must never cost the author their work, so this is
    // best-effort and the update goes ahead either way.
    let thumbnail: { thumb_path: string } | undefined;
    if (!thumbPinned) {
      try {
        const thumbPath = await uploadThumbnail();
        if (thumbPath) thumbnail = { thumb_path: thumbPath };
      } catch {
        // Swallowed deliberately; the save below is what matters.
      }
    }

    const { error } = await createClient()
      .from("visualisations")
      .update({ ...snapshot, ...thumbnail })
      .eq("id", visualisation.id);

    if (error) setSaveError(error.message);
    else setLastSaved(snapshot);

    lastSaveAt.current = Date.now();
    setSaving(false);
  }, [title, source, visibility, visualisation, thumbPinned, uploadThumbnail]);

  // Read through a ref so the throttle below does not restart on every
  // keystroke — depending on `save` directly would turn it into a debounce.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!canSave) return;

    const since = Date.now() - lastSaveAt.current;
    const wait = Math.max(0, AUTOSAVE_MS - since);
    const timer = window.setTimeout(() => void saveRef.current(), wait);

    return () => window.clearTimeout(timer);
    // `saving` is deliberately absent: it flips during the write and would
    // cancel and reschedule the very save in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, dirty, compile?.ok]);

  /**
   * E6.11 — fork the current script into a copy you own.
   *
   * Saving first matters: without it the original silently keeps the old
   * source while the fork carries your edits, and the two diverge for no
   * visible reason. The fork always takes what is on screen now, which is also
   * what makes forking someone else's work carry any tweaks you made to it.
   */
  const fork = useCallback(async () => {
    // A fork that will not compile is a dead end for whoever opens it, and the
    // save that precedes it is gated on a good compile anyway (E6.8).
    if (compile?.ok !== true) {
      setForkBlocked(true);
      return;
    }

    // Nothing open, so there is nothing to fork.
    if (!visualisation) return;

    if (!user) {
      setSignInOpen(true);
      return;
    }

    setForking(true);
    setSaveError(null);

    try {
      const supabase = createClient();

      // Only your own work can be saved; someone else's is read-only, and the
      // fork below carries the buffer either way.
      if (canEdit && dirty) {
        const { error } = await supabase
          .from("visualisations")
          .update({ title, source, visibility })
          .eq("id", visualisation.id);

        if (error) throw new Error(error.message);
      }

      const { data, error } = await supabase
        .from("visualisations")
        .insert({
          owner_id: user.id,
          title: `${title} (fork)`,
          description: visualisation.description,
          source,
          visibility: "private",
          forked_from_id: visualisation.id,
        })
        .select("id")
        .single();

      if (error || !data) throw new Error(error?.message ?? "Could not fork");

      // Hard navigation: the editor needs a fresh document to claim the engine.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/edit/${data.id}`;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not fork");
      setForking(false);
    }
  }, [
    compile,
    user,
    canEdit,
    dirty,
    title,
    source,
    visibility,
    visualisation,
  ]);

  const remove = useCallback(async () => {
    if (!visualisation) return;

    setDeleting(true);
    setSaveError(null);

    const { error } = await createClient()
      .from("visualisations")
      .delete()
      .eq("id", visualisation.id);

    if (error) {
      setDeleting(false);
      setDeleteShown(false);
      setSaveError(error.message);
      return;
    }

    // Straight back to the same URL. The row is gone, so the route renders the
    // empty stage — no special "deleted" destination to invent.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/edit/${visualisation.id}`;
  }, [visualisation]);

  /**
   * What the status line says, and why.
   *
   * The blocked case earns its own wording: with no Save button to press, a
   * script that will not compile would otherwise sit there looking merely
   * unsaved while the author kept typing into something that was never going
   * to be written.
   */
  const status = useMemo(() => {
    if (saveError) return { text: saveError, tone: "error" as const };
    if (saving) return { text: "Saving…", tone: "busy" as const };
    if (!dirty) return { text: "Saved", tone: "saved" as const };
    if (compile?.ok === false) {
      // Its own tone rather than sharing the failure colour: nothing has gone
      // wrong, the work is simply being held back until the script runs.
      return { text: "Not saved — fix the errors", tone: "blocked" as const };
    }
    return { text: "Unsaved changes", tone: "pending" as const };
  }, [saveError, saving, dirty, compile?.ok]);

  const fileAction = cn(
    "flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
    "whitespace-nowrap transition hover:bg-foreground/5 disabled:opacity-50",
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* E6.1 — the site's menubar, carrying only what acts on the site:
          start something new, fork what is open, open something else. What
          acts on *this* visualisation moved down onto the preview's own
          toolbar, next to the thing it changes. */}
      <TopBar
        position="static"
        actions={
          <>
            <CreateVisButton />

            {/* Deliberately outside the `canEdit` branch — forking someone
                else's work is the point — but there is nothing to fork with
                nothing open. */}
            <button
              type="button"
              onClick={() => void fork()}
              disabled={forking}
              hidden={empty}
              title="Save and fork into a copy you own"
              className={cn(barButton, barButtonBlue)}
            >
              {forking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitFork className="h-4 w-4" />
              )}
              <span className={barLabel}>Fork Vis</span>
            </button>

            <button
              type="button"
              onClick={() => setOpenPickerShown(true)}
              title="Open one of your visualisations"
              className={cn(barButton, barButtonBlue)}
            >
              <FolderOpen className="h-4 w-4" />
              <span className={barLabel}>Open Vis</span>
            </button>
          </>
        }
      />

      {empty ? (
        /* Nothing open. The shape of the editor is kept — a black stage with
           the panel split — so it reads as "waiting" rather than broken. */
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 bg-black">
          <div className="text-center">
            <p className="text-sm font-medium">No visualisation open</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start something new, or pick up where you left off.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <form method="POST" action="/edit">
              <button
                type="submit"
                className={cn(
                  "flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium",
                  "bg-emerald-500 text-black transition hover:bg-emerald-400",
                )}
              >
                <FilePlus className="h-4 w-4" />
                Create Vis
              </button>
            </form>

            <button
              type="button"
              onClick={() => setOpenPickerShown(true)}
              className={cn(
                "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
                "transition hover:bg-foreground/5",
              )}
            >
              <FolderOpen className="h-4 w-4" />
              Open Vis
            </button>
          </div>
        </div>
      ) : (
      <div ref={splitRef} className="flex min-h-0 flex-1">
        <div style={{ width: `${ratio}%` }} className="flex min-w-0 flex-col">
          <AiPrompt
            disabled={!canEdit || empty}
            generating={generating}
            onSubmit={generate}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              role="tablist"
              aria-label="Editor panel"
              className="flex shrink-0 border-b text-xs"
            >
              {(["script", "assets"] as const).map((name) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={editorTab === name}
                  onClick={() => setEditorTab(name)}
                  className={cn(
                    "cursor-pointer px-3 py-1.5 capitalize transition",
                    editorTab === name
                      ? "border-b-2 border-foreground text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* The editor stays mounted and is hidden with CSS rather than
                unmounted. CodeMirror owns the document, so tearing it down
                would discard the undo history and cursor, and remounting would
                reinitialise from the now-stale `initialValue`. */}
            <div
              className={cn("min-h-0 flex-1", editorTab === "script" ? "" : "hidden")}
            >
              <CodeEditor
                initialValue={visualisation?.source ?? ""}
                onChange={setSource}
                diagnostics={compile?.diagnostics ?? []}
                handleRef={editorHandle}
              />
            </div>

            {editorTab === "assets" && (
              <div className="min-h-0 flex-1">
                <AssetPanel
                  onInsert={(reference) => {
                    editorHandle.current?.insertAtCursor(reference);
                    // Straight back to the script: the point of inserting is to
                    // see where it landed.
                    setEditorTab("script");
                  }}
                />
              </div>
            )}
          </div>

          {/* Under the code rather than up in the menubar: it is a fact about
              what has just been typed, and edits are written on a throttle, so
              it reports rather than asks. */}
          <div
            title={dirty ? "Changes are written automatically" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 border-t px-3 py-1 text-[11px]",
              status.tone === "blocked"
                ? "text-amber-400"
                : status.tone === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {status.tone === "busy" ? (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
            ) : status.tone === "saved" ? (
              <Check className="h-3 w-3 shrink-0" />
            ) : status.tone === "blocked" || status.tone === "error" ? (
              <TriangleAlert className="h-3 w-3 shrink-0" />
            ) : (
              <Dot className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate">{status.text}</span>
          </div>
        </div>

        {/* E6.2 — drag-resizable divider; ratio persists. */}
        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={() => {
            dragging.current = true;
            document.body.style.userSelect = "none";
          }}
          className={cn(
            "w-1 shrink-0 cursor-col-resize bg-border transition-colors",
            "hover:bg-foreground/30",
          )}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Everything that acts on this visualisation, on the same parent as
              the preview it acts on: the name of the thing, then capturing a
              frame of it, who can see it, and getting rid of it. */}
          <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!canEdit}
              aria-label="Title"
              className={cn(
                "min-w-0 flex-1 rounded-md px-2 py-1 text-sm transition",
                // Given a surface of its own: sitting flush on the toolbar it
                // read as a heading, and nobody thinks to click a heading.
                "bg-foreground/[0.06] hover:bg-foreground/10",
                "outline-none placeholder:text-muted-foreground",
                "focus-visible:bg-foreground/10 focus-visible:ring-1 focus-visible:ring-ring",
                "disabled:bg-transparent disabled:opacity-60",
              )}
              placeholder="Untitled"
            />

            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={() => void captureThumbnail()}
                  disabled={capturing}
                  title={
                    thumbPinned
                      ? "Thumbnail pinned to a captured frame"
                      : "Pin the current frame as the thumbnail"
                  }
                  className={cn(fileAction, thumbPinned && "border-foreground/30 bg-foreground/10")}
                >
                  {capturing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : thumbPinned ? (
                    <Pin className="h-3.5 w-3.5" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  Capture frame
                </button>

                <select
                  value={visibility}
                  onChange={(event) => setVisibility(event.target.value as Visibility)}
                  aria-label="Visibility"
                  className="shrink-0 cursor-pointer rounded-md border bg-transparent px-2 py-1 text-xs"
                >
                  <option value="private">Private</option>
                  <option value="public">Public</option>
                </select>

                <button
                  type="button"
                  onClick={() => setDeleteShown(true)}
                  title="Delete this visualisation"
                  aria-label="Delete this visualisation"
                  className={fileAction}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">Read-only</span>
            )}
          </div>

          {/* E6.3 — 16:9 sized to the column; the log takes what's left. */}
          {/* Fullscreen expands just this box, so the visualisation fills the
              screen without dragging the code panel along with it. */}
          {/* Double-click matches the player, where the canvas does the same. */}
          <div
            ref={previewRef}
            onDoubleClick={togglePreviewFullscreen}
            className="aspect-video w-full shrink-0 bg-black"
          >
            <VisampCanvas
              ref={canvasHandle}
              source={liveSource}
              assets={assets}
              active
              analyser={analyser}
              onCompileResult={onCompileResult}
              onProperties={setProperties}
              onLog={onLog}
              className="h-full w-full"
            />
          </div>

          <EditorTransport fullscreenTarget={previewRef} />

          {/* Log and inspector share the bottom strip and collapse together —
              one toggle for the whole panel keeps the preview's height
              predictable while you work. */}
          <div className="flex min-h-0 flex-1 border-t">
            <EditorLog
              lines={logLines}
              collapsed={logCollapsed}
              onToggle={() => setLogCollapsed((value) => !value)}
              onClear={() => setLogLines([])}
              onJumpToLine={(line) => editorHandle.current?.goToLine(line)}
            />

            {!logCollapsed && <PropertiesInspector properties={properties} />}
          </div>
        </div>
      </div>
      )}

      <AlertDialog open={forkBlocked} onOpenChange={setForkBlocked}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This script isn&apos;t compiling</AlertDialogTitle>
            <AlertDialogDescription>
              A fork is a starting point for someone else, so it has to run.
              Fix the errors shown in the log, then fork again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setForkBlocked(false)}>
              Back to the code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteShown} onOpenChange={setDeleteShown}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this visualisation?</AlertDialogTitle>
            <AlertDialogDescription>
              {title || "This visualisation"} will be gone for good, along with
              anything anyone has said about it. Forks other people have made
              keep working and keep their attribution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                // Held open while the delete runs, so the dialog does not
                // vanish and leave nothing to show it is working.
                event.preventDefault();
                void remove();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OpenVisDialog
        open={openPickerShown}
        onOpenChange={setOpenPickerShown}
        currentId={visualisation?.id}
      />

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
