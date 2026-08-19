"use client";

import {
  VisampCanvas,
  type CompileResult,
  type LogEntry,
  type PropertyView,
  type VisampCanvasHandle,
} from "@visamp/player";
import { Camera, Check, GitFork, Loader2, Pin } from "lucide-react";
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
import { BrandLockup } from "@/components/brand/logo";
import { CodeEditor, type CodeEditorHandle } from "@/components/editor/code-editor";
import { EditorLog, type LogLine } from "@/components/editor/editor-log";
import { EditorTransport } from "@/components/editor/editor-transport";
import { PropertiesInspector } from "@/components/editor/properties-inspector";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAnalyser } from "@/hooks/use-analyser";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Visualisation = Database["public"]["Tables"]["visualisations"]["Row"];
type Visibility = Database["public"]["Enums"]["visibility"];

/** E6.5 — how long to wait after the last keystroke before recompiling. */
const RECOMPILE_MS = 200;
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
  visualisation: Visualisation;
  canEdit: boolean;
}

export function EditorShell({ visualisation, canEdit }: EditorShellProps) {
  const [title, setTitle] = useState(visualisation.title);
  const [visibility, setVisibility] = useState<Visibility>(visualisation.visibility);
  const [source, setSource] = useState(visualisation.source);
  /** Debounced copy — this is what the engine actually receives. */
  const [liveSource, setLiveSource] = useState(visualisation.source);

  const [compile, setCompile] = useState<CompileResult | null>(null);
  const [logLines, setLogLines] = useState<LogLine[]>([]);
  const [properties, setProperties] = useState<PropertyView[]>([]);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // localStorage is read through useSyncExternalStore so the server can render
  // the default without a hydration mismatch. `override` takes over on drag.
  const storedRatio = useSyncExternalStore(
    () => () => {},
    readStoredRatio,
    () => DEFAULT_RATIO,
  );
  const [override, setOverride] = useState<number | null>(null);
  const ratio = override ?? storedRatio;

  const editorHandle = useRef<CodeEditorHandle | null>(null);
  const canvasHandle = useRef<VisampCanvasHandle>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  // E6.10 — a pinned thumb is the author's explicit choice and survives saves.
  const analyser = useAnalyser();
  const { user } = useAuth();
  const [thumbPinned, setThumbPinned] = useState(visualisation.thumb_pinned);
  const [forking, setForking] = useState(false);
  const [forkBlocked, setForkBlocked] = useState(false);
  const [signInOpen, setSignInOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);

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
    setLogLines(
      result.ok
        ? [{ id: (logSeq += 1), level: "info", message: "Compiled.", at }]
        : result.diagnostics.map((diagnostic) => ({
            id: (logSeq += 1),
            level: "error" as const,
            message: diagnostic.message,
            line: diagnostic.line,
            at,
          })),
    );

    // E6.6 — errors force the log open.
    if (!result.ok) setLogCollapsed(false);
  }, []);

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
    source !== visualisation.source ||
    title !== visualisation.title ||
    visibility !== visualisation.visibility;

  // E6.8 — save is only reachable from a successful compile.
  const canSave = canEdit && dirty && compile?.ok === true && !saving;

  /**
   * Captures the current frame at a fixed 1280x720 and stores it under
   * <owner>/<vis>.png — a stable key, so re-capturing replaces rather than
   * accumulating. The returned URL carries a cache-buster because of that.
   */
  const uploadThumbnail = useCallback(async (): Promise<string | null> => {
    const handle = canvasHandle.current;
    if (!handle) return null;

    const blob = await handle.captureFrame();
    const path = `${visualisation.owner_id}/${visualisation.id}.png`;
    const supabase = createClient();

    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(path, blob, { contentType: "image/png", upsert: true });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }, [visualisation.id, visualisation.owner_id]);

  const captureThumbnail = useCallback(async () => {
    setCapturing(true);
    setSaveError(null);

    try {
      const thumbUrl = await uploadThumbnail();
      if (thumbUrl) {
        const { error } = await createClient()
          .from("visualisations")
          .update({ thumb_url: thumbUrl, thumb_pinned: true })
          .eq("id", visualisation.id);

        if (error) throw new Error(error.message);
        setThumbPinned(true);
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Capture failed");
    }

    setCapturing(false);
  }, [uploadThumbnail, visualisation.id]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);

    // E6.10 — an unpinned thumb is refreshed from the current frame on save.
    // A thumbnail failure must never cost the author their work, so this is
    // best-effort and the update goes ahead either way.
    let thumbnail: { thumb_url: string } | undefined;
    if (!thumbPinned) {
      try {
        const thumbUrl = await uploadThumbnail();
        if (thumbUrl) thumbnail = { thumb_url: thumbUrl };
      } catch {
        // Swallowed deliberately; the save below is what matters.
      }
    }

    const { error } = await createClient()
      .from("visualisations")
      .update({ title, source, visibility, ...thumbnail })
      .eq("id", visualisation.id);

    if (error) setSaveError(error.message);
    else setSavedAt(Date.now());

    setSaving(false);
  }, [title, source, visibility, visualisation.id, thumbPinned, uploadThumbnail]);

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
    visualisation.id,
    visualisation.description,
  ]);

  const saveLabel = useMemo(() => {
    if (saving) return "Saving…";
    if (!dirty && savedAt) return "Saved";
    return "Save";
  }, [saving, dirty, savedAt]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {/* E6.1 — thin menubar with the mark and room for more. */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b bg-black px-4">
        {/* Hard navigation on purpose: leaving the editor must tear down the
            document so the player's canvas can claim the WASM singleton. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="shrink-0" aria-label="Back to the player">
          <BrandLockup className="h-5" />
        </a>

        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={!canEdit}
          aria-label="Title"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
          placeholder="Untitled"
        />

        <button
          type="button"
          onClick={() => void fork()}
          disabled={forking}
          title="Save and fork into a copy you own"
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
            "hover:bg-foreground/5 disabled:opacity-50",
          )}
        >
          {forking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <GitFork className="h-3.5 w-3.5" />
          )}
          Fork
        </button>

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
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
                "hover:bg-foreground/5 disabled:opacity-50",
                thumbPinned && "border-foreground/30 bg-foreground/10",
              )}
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
              className="rounded-md border bg-transparent px-2 py-1 text-xs"
            >
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>

            {saveError && (
              <span className="max-w-48 truncate text-xs text-destructive">
                {saveError}
              </span>
            )}

            <Button size="sm" disabled={!canSave} onClick={() => void save()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : !dirty && savedAt ? (
                <Check className="h-3.5 w-3.5" />
              ) : null}
              {saveLabel}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">Read-only</span>
        )}
      </header>

      <div ref={splitRef} className="flex min-h-0 flex-1">
        <div style={{ width: `${ratio}%` }} className="min-w-0">
          <CodeEditor
            initialValue={visualisation.source}
            onChange={setSource}
            diagnostics={compile?.diagnostics ?? []}
            handleRef={editorHandle}
          />
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
          {/* E6.3 — 16:9 sized to the column; the log takes what's left. */}
          {/* Fullscreen expands just this box, so the visualisation fills the
              screen without dragging the code panel along with it. */}
          <div ref={previewRef} className="aspect-video w-full shrink-0 bg-black">
            <VisampCanvas
              ref={canvasHandle}
              source={liveSource}
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

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} />
    </div>
  );
}
