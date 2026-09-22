"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Clip } from "@/lib/sets/model";
import {
  defaultTitleProperties,
  parseTitleProperties,
  titlePositions,
  type TitleProperties,
} from "@/lib/sets/title-properties";

export function ClipProperties({
  clip,
  onApply,
  onClose,
}: {
  clip: Clip;
  onApply: (properties: TitleProperties) => void;
  onClose: () => void;
}) {
  const initial = clip.titleProperties ?? defaultTitleProperties;
  const [properties, setProperties] = useState(initial);
  const [start, setStart] = useState(String(initial.startMs / 1000));
  const [duration, setDuration] = useState(String(initial.durationMs / 1000));
  const [error, setError] = useState("");
  const fieldClass =
    "w-full rounded-md border border-white/20 bg-background px-3 py-2";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Clip properties</DialogTitle>
        <DialogDescription>
          {clip.media.title} ·{" "}
          {clip.media.kind === "audio" ? "Audio" : "Visualisation"}
        </DialogDescription>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              if (
                properties.enabled &&
                (!start.trim() ||
                  !duration.trim() ||
                  Number(start) < 0 ||
                  Number(duration) <= 0)
              )
                throw new Error(
                  "Enter a non-negative start and a duration greater than zero.",
                );
              const next = parseTitleProperties({
                ...properties,
                startMs: properties.enabled
                  ? Math.round(Number(start) * 1000)
                  : initial.startMs,
                durationMs: properties.enabled
                  ? Math.round(Number(duration) * 1000)
                  : initial.durationMs,
              });
              onApply(next);
              onClose();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Invalid title settings.",
              );
            }
          }}
        >
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={properties.enabled}
              onChange={(e) =>
                setProperties({ ...properties, enabled: e.target.checked })
              }
            />
            Show title
          </label>
          {properties.enabled && (
            <div className="grid gap-4">
              <label className="grid gap-1">
                Position
                <select
                  className={fieldClass}
                  value={properties.position}
                  onChange={(e) =>
                    setProperties({
                      ...properties,
                      position: e.target.value as TitleProperties["position"],
                    })
                  }
                >
                  {titlePositions.map((position) => (
                    <option key={position}>{position}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  Start (seconds)
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    step="0.001"
                    required
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  Duration (seconds)
                  <input
                    className={fieldClass}
                    type="number"
                    min="0.001"
                    step="0.001"
                    required
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Start is relative to this clip. The title ends when its duration
                expires or the clip ends.
              </p>
              <label className="grid gap-1">
                Size
                <select
                  className={fieldClass}
                  value={properties.size}
                  onChange={(e) =>
                    setProperties({
                      ...properties,
                      size: e.target.value as TitleProperties["size"],
                    })
                  }
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={properties.showAttribution}
                  onChange={(e) =>
                    setProperties({
                      ...properties,
                      showAttribution: e.target.checked,
                    })
                  }
                />
                {clip.media.kind === "audio" ? "Show artist" : "Show creator"}
              </label>
            </div>
          )}
          {error && (
            <p role="alert" className="text-red-300">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Apply</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
