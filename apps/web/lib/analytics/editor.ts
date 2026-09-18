"use client";
import { track, consent, consentVersion } from "./client";
const saves = new Map<
  string,
  { last: number; pending: boolean; visibility: string; version: number }
>();
export function confirmedSave(id: string, visibility: string) {
  if (consent() !== "accepted") {
    saves.delete(id);
    return;
  }
  const previous = saves.get(id);
  const now = Date.now();
  if (
    !previous ||
    previous.version !== consentVersion() ||
    now - previous.last >= 30_000
  ) {
    track("visualisation_saved", { visualisation_id: id, visibility });
    saves.set(id, {
      last: now,
      pending: false,
      visibility,
      version: consentVersion(),
    });
  } else saves.set(id, { ...previous, pending: true, visibility });
}
export function flushConfirmedSave(id: string) {
  const saved = saves.get(id);
  if (saved?.pending && saved.version === consentVersion())
    track("visualisation_saved", {
      visualisation_id: id,
      visibility: saved.visibility,
    });
  saves.delete(id);
}
