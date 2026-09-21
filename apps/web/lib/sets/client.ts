import { type MediaRef, type SetContent, clips } from "./model";
export async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Request failed.");
  return data as T;
}
const files = new Map<string, File>();
function fileDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("visamp-set-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function rememberFile(id: string, file: File) {
  files.set(id, file);
  const db = await fileDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("files", "readwrite");
      t.objectStore("files").put(file, id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } finally {
    db.close();
  }
}
export async function localFile(id: string) {
  if (files.has(id)) return files.get(id)!;
  const db = await fileDB();
  try {
    return await new Promise<File | undefined>((resolve, reject) => {
      const r = db.transaction("files").objectStore("files").get(id);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export type Resolved = {
  visuals: Record<string, string>;
  unavailable: Record<string, string>;
};
export async function resolveSet(set: SetContent): Promise<Resolved> {
  const result: Resolved = { visuals: {}, unavailable: {} };
  const refs = [
    ...new Map(clips(set).map((c) => [c.media.id, c.media])).values(),
  ];
  for (let i = 0; i < refs.length; i += 40) {
    const batch = refs.slice(i, i + 40);
    const included = new Set(batch.map((m) => m.id));
    const data = await request<
      Resolved & { durations: Record<string, number> }
    >("/api/sets/resolve", "POST", {
      ...set,
      audioClips: set.audioClips.filter((c) => included.has(c.media.id)),
      visualClips: set.visualClips.filter((c) => included.has(c.media.id)),
    });
    Object.assign(result.visuals, data.visuals);
    Object.assign(result.unavailable, data.unavailable);
    for (const c of set.audioClips) {
      const real = data.durations[c.media.id];
      if (real && c.sourceOffsetMs + c.durationMs > real)
        result.unavailable[c.media.id] = "Clip exceeds the source duration.";
    }
    for (const m of batch)
      if (m.source === "file")
        try {
          if (!(await localFile(m.id)))
            result.unavailable[m.id] = "Local file unavailable; reselect it.";
        } catch {
          result.unavailable[m.id] =
            "Local file storage unavailable; reselect it.";
        }
  }
  return result;
}
export async function fileRef(file: File): Promise<MediaRef> {
  const url = URL.createObjectURL(file);
  try {
    const ms = await new Promise<number>((resolve, reject) => {
      const a = new Audio();
      const timeout = setTimeout(() => {
        a.removeAttribute("src");
        reject(new Error("Could not read audio duration."));
      }, 15000);
      a.onloadedmetadata = () => {
        clearTimeout(timeout);
        const n = Math.round(a.duration * 1000);
        a.removeAttribute("src");
        if (Number.isSafeInteger(n) && n > 0) resolve(n);
        else reject(new Error("Audio duration unavailable."));
      };
      a.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Could not read audio file."));
      };
      a.src = url;
    });
    const fingerprint = new TextEncoder().encode(
      JSON.stringify([file.name, file.size, file.lastModified]),
    );
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", fingerprint),
    );
    const id = `file:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
    await rememberFile(id, file);
    return {
      id,
      kind: "audio",
      source: "file",
      title: file.name,
      attribution: "My files",
      durationMs: ms,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
