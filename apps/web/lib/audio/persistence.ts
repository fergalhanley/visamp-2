/**
 * Tracklist persistence (E4.5).
 *
 * Chromium exposes the File System Access API, whose handles survive a reload
 * and can be re-opened after a permission prompt — so the tracklist comes back
 * for real. Everywhere else the best we can do is remember names and order and
 * ask the viewer to re-add the files, since a `File` from `<input>` is only
 * valid for the life of the page.
 */

const DB_NAME = "visamp-audio";
const DB_VERSION = 1;
const STORE = "handles";
const HANDLES_KEY = "tracklist";
const NAMES_KEY = "visamp.tracklist.names";

// `showOpenFilePicker` and friends are not in TypeScript's DOM lib yet.
interface FileSystemFileHandleLike {
  name: string;
  getFile(): Promise<File>;
  queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
}

interface FilePickerWindow {
  showOpenFilePicker?(options?: {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }): Promise<FileSystemFileHandleLike[]>;
}

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as FilePickerWindow).showOpenFilePicker === "function"
  );
}

/** Rough Chromium check, used only to word the recommendation in the A panel. */
export function isChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Chrome|Chromium|Edg/.test(navigator.userAgent);
}

export async function pickAudioFiles(): Promise<FileSystemFileHandleLike[]> {
  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (!picker) return [];

  return picker({
    multiple: true,
    types: [
      {
        description: "Audio",
        accept: {
          "audio/*": [".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav", ".flac"],
        },
      },
    ],
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const value = await new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function saveHandles(
  handles: FileSystemFileHandleLike[],
): Promise<void> {
  if (!supportsFileSystemAccess()) return;
  try {
    await idbPut(HANDLES_KEY, handles);
  } catch {
    // Persistence is a convenience; never let it break the tracklist.
  }
}

/**
 * Returns handles whose read permission is already granted, plus the names of
 * any that now need a fresh prompt. Permission is never requested here —
 * `requestPermission` must come from a user gesture.
 */
export async function loadHandles(): Promise<{
  granted: FileSystemFileHandleLike[];
  needsPermission: FileSystemFileHandleLike[];
}> {
  if (!supportsFileSystemAccess()) return { granted: [], needsPermission: [] };

  try {
    const stored = await idbGet<FileSystemFileHandleLike[]>(HANDLES_KEY);
    if (!stored?.length) return { granted: [], needsPermission: [] };

    const granted: FileSystemFileHandleLike[] = [];
    const needsPermission: FileSystemFileHandleLike[] = [];

    for (const handle of stored) {
      const state = (await handle.queryPermission?.({ mode: "read" })) ?? "granted";
      if (state === "granted") granted.push(handle);
      else needsPermission.push(handle);
    }
    return { granted, needsPermission };
  } catch {
    return { granted: [], needsPermission: [] };
  }
}

export function saveTrackNames(names: string[]): void {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names));
  } catch {
    // Private mode, quota, whatever — not worth surfacing.
  }
}

export function loadTrackNames(): string[] {
  try {
    const raw = localStorage.getItem(NAMES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

export type { FileSystemFileHandleLike };
