export type VideoParamValue = string | number | boolean;

export type VideoMediaRef = {
  id: string;
  kind: "audio" | "visual";
  source: "hosted" | "visual";
  title: string;
  attribution: string;
  durationMs?: number;
};

export type VideoAudioClip = {
  id: string;
  media: VideoMediaRef & { kind: "audio"; source: "hosted" };
  startMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};

export type VideoVisualClip = {
  id: string;
  media: VideoMediaRef & { kind: "visual"; source: "visual" };
  startMs: number;
  durationMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  paramValues: Record<string, VideoParamValue>;
  visualLicenceId?: string;
};

export type VideoContent = {
  schemaVersion: 1;
  aspectRatio: "9:16" | "16:9" | "1:1";
  audioClips: VideoAudioClip[];
  visualClips: VideoVisualClip[];
};

export type VideoSummary = {
  id: string;
  title: string;
  status: "draft" | "rendering" | "ready" | "error";
  updatedAt: string;
  distributionState: Record<string, unknown>;
  scheduleState: Record<string, unknown>;
};

export const emptyVideo = (): VideoContent => ({
  schemaVersion: 1,
  aspectRatio: "9:16",
  audioClips: [],
  visualClips: [],
});
