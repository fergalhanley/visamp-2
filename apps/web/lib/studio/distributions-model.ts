export type MasterSettings = {
  filename: string;
  format: "mp4" | "webm";
  resolution: "720p" | "1080p";
  frameRate: 30 | 60;
};
export type Distribution = {
  id: string;
  setId: string;
  target: "master_download";
  status: "draft";
  settings: MasterSettings;
  createdAt: string;
  updatedAt: string;
};
export const distributionTargets = [
  { id: "master_download", label: "Master Downloads", available: true },
  { id: "youtube", label: "YouTube", available: false },
  { id: "tiktok", label: "TikTok", available: false },
  { id: "instagram", label: "Instagram", available: false },
  { id: "facebook", label: "Facebook", available: false },
  { id: "x", label: "X", available: false },
] as const;
export const defaultMasterSettings = (name: string): MasterSettings => ({
  filename:
    name
      .replace(/[^\p{L}\p{N}_ -]/gu, "")
      .trim()
      .slice(0, 120) || "Master",
  format: "mp4",
  resolution: "1080p",
  frameRate: 30,
});
export function parseMasterSettings(value: unknown): MasterSettings {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Master Downloads settings.");
  const settings = value as Record<string, unknown>;
  if (
    typeof settings.filename !== "string" ||
    !settings.filename.trim() ||
    settings.filename.length > 120 ||
    /[\\/\u0000-\u001f\u007f]/.test(settings.filename)
  )
    throw new Error(
      "Enter a filename of 1–120 characters without slashes or control characters.",
    );
  if (
    (settings.format !== "mp4" && settings.format !== "webm") ||
    (settings.resolution !== "720p" && settings.resolution !== "1080p") ||
    (settings.frameRate !== 30 && settings.frameRate !== 60)
  )
    throw new Error("Choose valid output settings.");
  return {
    filename: settings.filename.trim(),
    format: settings.format,
    resolution: settings.resolution,
    frameRate: settings.frameRate,
  };
}
