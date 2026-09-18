import { track } from "@/lib/analytics/client";
export async function musicRequest<T>(
  url: string,
  body?: Record<string, unknown>,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not update your music library.");
  if (url === "/api/music/collections" && body) {
    if (body.action === "favourite") track("favourite_changed", { content_type: "track", content_id: String(body.trackId), action: body.value ? "added" : "removed" });
    if (body.action === "create") track("playlist_created", { playlist_type: "audio", playlist_id: data.playlist?.id });
    if (body.action === "add" || body.action === "remove") track("playlist_item_changed", { playlist_type: "audio", playlist_id: String(body.playlistId), content_id: String(body.trackId), action: body.action === "add" ? "added" : "removed" });
  }
  return data as T;
}
export function collectionChanged() {
  window.dispatchEvent(new Event("visamp:music-changed"));
}
