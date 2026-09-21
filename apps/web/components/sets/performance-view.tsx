"use client";
import { duration, timecode } from "@/lib/sets/model";
import { schedule } from "@/lib/sets/scheduler";
import type { usePerformance } from "./use-performance";
export type Performance = ReturnType<typeof usePerformance>;
export function PerformanceView({
  performance: { attachFrame, ...p },
  play,
  onPopout = false,
  outputHeight,
  divider,
  manual = false,
}: {
  performance: Performance;
  play?: () => void;
  onPopout?: boolean;
  outputHeight?: number;
  divider?: React.ReactNode;
  manual?: boolean;
}) {
  const s = p.state;
  const scheduled = schedule(s.set, s.positionMs);
  return (
    <section className="set-performance">
      <div
        className="set-output"
        style={
          outputHeight
            ? { height: outputHeight, aspectRatio: "auto" }
            : undefined
        }
      >
        {p.embedded ? (
          <iframe
            key={p.embeddedId}
            ref={attachFrame}
            title="Set output"
            src={`/vj-mode/output/${p.session}?output=${p.embeddedId}`}
            allow="autoplay; fullscreen"
          />
        ) : (
          <div className="set-output-status">
            Pop-out connected
            <br />
            <small>Rendering and audio are running in the output window.</small>
          </div>
        )}
      </div>
      {divider}
      <div className="set-transport">
        <button
          aria-label="Jump to start"
          onClick={() => p.send({ action: "seek", value: 0 })}
        >
          ↤
        </button>
        <button
          onClick={() =>
            s.playing
              ? p.send({ action: "pause" })
              : play
                ? play()
                : p.send({ action: "play" })
          }
        >
          {s.playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => p.send({ action: "stop" })}>Stop</button>
        <span>
          {manual
            ? "Manual performance"
            : `${timecode(s.positionMs)} / ${timecode(duration(s.set))}`}
        </span>
        <label>
          <input
            type="checkbox"
            checked={s.loop}
            onChange={(e) =>
              p.send({ action: "loop", value: e.target.checked })
            }
          />
          Loop
        </label>
        <label>
          Volume
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={s.volume}
            onChange={(e) =>
              p.send({ action: "volume", value: Number(e.target.value) })
            }
          />
        </label>
        <button onClick={() => p.send({ action: "mute", value: !s.muted })}>
          {s.muted ? "Unmute" : "Mute"}
        </button>
      </div>
      <input
        aria-label="Set playhead"
        type="range"
        min="0"
        max={duration(s.set) || 1}
        step="10"
        value={Math.min(s.positionMs, duration(s.set))}
        disabled={s.playing || manual}
        onChange={(e) =>
          p.send({ action: "seek", value: Number(e.target.value) })
        }
      />
      <p>
        {s.complete ? "Set complete" : p.status} · Visual transitions: fade
        through black
      </p>
      <div className="set-now">
        <p>
          Audio:{" "}
          {s.audioOverride ? (
            <>
              <b>LIVE OVERRIDE</b> {s.audioOverride.media.title}{" "}
              <button onClick={() => void p.override("audio", null)}>
                Return audio to Set
              </button>
            </>
          ) : (
            scheduled.audio.map((a) => a.clip.media.title).join(" → ") ||
            "Silence"
          )}
          <br />
          <small>
            Next:{" "}
            {scheduled.nextAudio
              ? `${scheduled.nextAudio.media.title} in ${timecode(scheduled.nextAudio.startMs - s.positionMs)}`
              : "—"}
          </small>
        </p>
        <p>
          Visual:{" "}
          {s.visualOverride ? (
            <>
              <b>LIVE OVERRIDE</b> {s.visualOverride.media.title}{" "}
              <button onClick={() => void p.override("visual", null)}>
                Return visual to Set
              </button>
            </>
          ) : (
            scheduled.visual.map((a) => a.clip.media.title).join(" → ") ||
            "Black"
          )}
          <br />
          <small>
            Next:{" "}
            {scheduled.nextVisual
              ? `${scheduled.nextVisual.media.title} in ${timecode(scheduled.nextVisual.startMs - s.positionMs)}`
              : "—"}
          </small>
        </p>
      </div>
      {onPopout && (
        <div>
          <button onClick={p.popout}>
            {p.status === "Pop-out disconnected"
              ? "Reopen output"
              : "Pop out output"}
          </button>
          <button onClick={p.restart}>Restart Output</button>
        </div>
      )}
      {p.errors.length > 0 && (
        <div role="alert">
          {p.errors.map((e, i) => (
            <p key={i}>{e}</p>
          ))}
        </div>
      )}
    </section>
  );
}
