import type { EditorSnapshot } from "../../hooks/use-editor-autosave";

/** Thumbnail capture/upload is optional and must not hold up document storage. */
export async function saveDocument(
  snapshot: EditorSnapshot,
  signal: AbortSignal,
  write: (snapshot: EditorSnapshot, signal: AbortSignal) => Promise<void>,
  refreshThumbnail: (signal: AbortSignal) => Promise<void>,
  warn: (message: string) => void,
): Promise<void> {
  await write(snapshot, signal);
  const thumbnailController = new AbortController();
  const abortThumbnail = () => thumbnailController.abort();
  signal.addEventListener("abort", abortThumbnail, { once: true });
  if (signal.aborted) abortThumbnail();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      refreshThumbnail(thumbnailController.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("Thumbnail refresh timed out"));
          thumbnailController.abort();
        }, 5000);
      }),
    ]);
  } catch {
    warn("Changes saved, but the thumbnail could not be refreshed.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abortThumbnail);
    thumbnailController.abort();
  }
}
