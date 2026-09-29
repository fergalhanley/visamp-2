export interface RecordedVideo {
  blob: Blob;
  extension: "mp4" | "webm";
}

function preferredMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";

  return (
    [
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
  );
}

/** Record a real-time canvas stream with the current Visamp media audio. */
export function recordVideo(
  video: MediaStream,
  audio: MediaStream,
  durationMs: number,
): Promise<RecordedVideo> {
  if (typeof MediaRecorder === "undefined")
    return Promise.reject(
      new Error("Video export is not supported by this browser."),
    );
  if (!Number.isFinite(durationMs) || durationMs < 500)
    return Promise.reject(new Error("The export duration is too short."));

  const videoTracks = video.getVideoTracks();
  const audioTracks = audio.getAudioTracks().map((track) => track.clone());
  if (!videoTracks.length)
    return Promise.reject(new Error("The visual preview is not ready."));
  if (!audioTracks.length)
    return Promise.reject(new Error("The track audio is not ready."));

  const stream = new MediaStream([...videoTracks, ...audioTracks]);
  const mimeType = preferredMimeType();
  const chunks: Blob[] = [];

  return new Promise((resolve, reject) => {
    let recorder: MediaRecorder;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      clearTimeout(timer);
      stream.getTracks().forEach((track) => track.stop());
    };

    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 192_000,
      });
    } catch (error) {
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error("Could not start video export."),
      );
      return;
    }

    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener(
      "error",
      () => {
        cleanup();
        reject(new Error("Video recording failed."));
      },
      { once: true },
    );
    recorder.addEventListener(
      "stop",
      () => {
        const type = recorder.mimeType || mimeType || "video/webm";
        cleanup();
        if (!chunks.length) {
          reject(new Error("The browser did not produce a video."));
          return;
        }
        resolve({
          blob: new Blob(chunks, { type }),
          extension: type.startsWith("video/mp4") ? "mp4" : "webm",
        });
      },
      { once: true },
    );

    recorder.start(1000);
    timer = setTimeout(() => {
      if (recorder.state !== "inactive") recorder.stop();
    }, durationMs);
  });
}

export function downloadRecordedVideo(
  video: RecordedVideo,
  filenameStem: string,
) {
  const url = URL.createObjectURL(video.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenameStem}.${video.extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
