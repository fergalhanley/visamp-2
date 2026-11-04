"use client";
import type {
  Distribution,
  MasterSettings,
} from "@/lib/studio/distributions-model";
import { duration, timecode, type SetDocument } from "@/lib/sets/model";

export function MasterDownloadSettings({
  distribution,
  set,
  settings,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  distribution: Distribution;
  set: SetDocument;
  settings: MasterSettings;
  dirty: boolean;
  saving: boolean;
  onChange: (settings: MasterSettings) => void;
  onSave: () => void;
}) {
  return (
    <form
      className="studio-master-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div>
        <h3>Master Downloads</h3>
        <p className="studio-muted">
          A video file for your own use and distribution. No social account
          required.
        </p>
      </div>
      <fieldset disabled={saving}>
        <label>
          Filename
          <input
            required
            maxLength={120}
            value={settings.filename}
            onChange={(event) =>
              onChange({ ...settings, filename: event.target.value })
            }
          />
        </label>
        <label>
          File format
          <select
            value={settings.format}
            onChange={(event) =>
              onChange({
                ...settings,
                format: event.target.value as MasterSettings["format"],
              })
            }
          >
            <option value="mp4">MP4</option>
            <option value="webm">WebM</option>
          </select>
        </label>
        <div className="studio-settings-pair">
          <label>
            Resolution
            <select
              value={settings.resolution}
              onChange={(event) =>
                onChange({
                  ...settings,
                  resolution: event.target
                    .value as MasterSettings["resolution"],
                })
              }
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
          <label>
            Frame rate
            <select
              value={settings.frameRate}
              onChange={(event) =>
                onChange({
                  ...settings,
                  frameRate: Number(
                    event.target.value,
                  ) as MasterSettings["frameRate"],
                })
              }
            >
              <option value={30}>30 fps</option>
              <option value={60}>60 fps</option>
            </select>
          </label>
        </div>
        <dl className="studio-summary">
          <div>
            <dt>Source</dt>
            <dd>{set.name}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{timecode(duration(set))}</dd>
          </div>
          <div>
            <dt>Aspect ratio</dt>
            <dd>{set.aspectRatio}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Draft</dd>
          </div>
        </dl>
        <div className="studio-save">
          <button type="submit" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
          <span role="status">{dirty ? "Unsaved changes" : "Saved"}</span>
        </div>
      </fieldset>
      <p className="studio-muted">
        Master Downloads setup is available now. Rendering and downloading are
        coming next.
      </p>
      <p className="studio-muted">
        Updated {new Date(distribution.updatedAt).toLocaleString()}
      </p>
    </form>
  );
}
