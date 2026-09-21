export const eventProperties = {
  set_created: [],
  set_opened: [],
  set_clip_added: ["type"],
  set_preview_started: [],
  set_validation_failed: [],
  set_opened_in_vj_mode: [],
  vj_session_started: [],
  vj_set_started: [],
  vj_output_popped_out: [],
  vj_output_disconnected: [],
  vj_input_capture_started: [],
  vj_override_started: ["type"],
  vj_override_cleared: ["type"],
  vj_playback_error: ["failure_category"],
  vj_set_completed: [],
  page_viewed: [],
  cta_clicked: ["cta", "placement"],
  signup_started: ["method"],
  signup_completed: ["method"],
  login_completed: ["method"],
  logout_completed: [],
  search_performed: ["content_type", "result_count", "source_panel"],
  content_selected: ["content_type", "content_id", "position", "source_panel"],
  playback_started: ["session_id", "source_type", "track_id"],
  playback_summary: [
    "session_id",
    "source_type",
    "track_id",
    "listened_seconds",
    "segment",
    "reason",
  ],
  playback_failed: ["source_type", "failure_category"],
  visualisation_loaded: ["visualisation_id", "duration_ms"],
  audio_source_changed: ["previous", "value"],
  visualisation_mode_changed: ["previous", "value"],
  favourite_changed: ["content_type", "content_id", "action"],
  playlist_created: ["playlist_type", "playlist_id"],
  playlist_item_changed: [
    "playlist_type",
    "playlist_id",
    "content_id",
    "action",
    "count",
  ],
  editor_opened: ["visualisation_id"],
  visualisation_created: ["visualisation_id", "method"],
  visualisation_saved: ["visualisation_id", "visibility"],
  visualisation_published: ["visualisation_id"],
  visualisation_forked: ["visualisation_id", "source_id"],
  generation_requested: ["request_id", "mode", "model"],
  generation_completed: [
    "request_id",
    "mode",
    "model",
    "attempts",
    "duration_ms",
    "charged_credits",
  ],
  generation_failed: [
    "request_id",
    "mode",
    "model",
    "attempts",
    "duration_ms",
    "charged_credits",
    "failure_category",
  ],
  generation_recovery_selected: ["choice"],
  artist_created: ["artist_id"],
  artist_name_conflict: [],
  track_upload_started: ["upload_id", "artist_id", "bytes"],
  track_upload_completed: ["upload_id", "artist_id", "track_id"],
  track_upload_failed: ["upload_id", "failure_category"],
  track_removed: ["track_id"],
  billing_viewed: [],
  checkout_started: ["checkout_id", "amount_cents", "currency", "credits"],
  checkout_failed: ["failure_category"],
  credits_purchased: ["checkout_id", "amount_cents", "currency", "credits"],
} as const;
export type AnalyticsEvent = keyof typeof eventProperties;
type Value = string | number | boolean | null;
export type EventProperties<E extends AnalyticsEvent> = Partial<
  Record<(typeof eventProperties)[E][number], Value>
>;
export function cleanProperties(
  event: AnalyticsEvent,
  properties: Record<string, unknown>,
): Record<string, Value> {
  const result: Record<string, Value> = {};
  for (const key of eventProperties[event]) {
    const value = properties[key];
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    )
      result[key] = value;
    else if (
      typeof value === "string" &&
      value.length <= 120 &&
      !/[?@\n]/.test(value)
    )
      result[key] = value;
  }
  return result;
}
