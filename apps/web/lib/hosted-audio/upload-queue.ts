/** One failure belongs to its row; slots always continue with the next file. */
export async function runUploadQueue<T>(
  rows: readonly T[],
  upload: (row: T) => Promise<void>,
  failed: (row: T, error: unknown) => void,
  active: () => boolean,
  concurrency = 3,
) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (active()) {
        const index = cursor++;
        if (index >= rows.length) break;
        const row = rows[index]!;
        try {
          await upload(row);
        } catch (error) {
          failed(row, error);
        }
      }
    }),
  );
}

/** Serialize whole-file hashing so three 250 MB buffers aren't held at once. */
export function createFileHasher() {
  let tail: Promise<unknown> = Promise.resolve();
  return (file: Blob) => {
    const hash = tail.then(async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    });
    tail = hash.catch(() => {});
    return hash;
  };
}
