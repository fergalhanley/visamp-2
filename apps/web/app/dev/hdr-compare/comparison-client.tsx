"use client";

import { useState } from "react";
import { VisampCanvas } from "@visamp/player";

// Only uses features supported by the initial Rust HDR snapshot bridge:
// one unlit, untextured cube with no lights, overlays or wireframes.
const SOURCE = `context 3d

render {
  draw::cube(intensity: 3.0)
}
`;

export function HdrComparisonClient() {
  const [active, setActive] = useState(false);
  const [preview, setPreview] = useState(true);
  const [message, setMessage] = useState("");
  const [intensity, setIntensity] = useState(2.5);
  const [workaround, setWorkaround] = useState(true);
  return (
    <main style={{ background: "#0b0c13", color: "#f4f4f6", minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Visamp HDR — WebGL / WebGPU comparison</h1>
      <p style={{ maxWidth: 900, lineHeight: 1.5 }}>
        Development-only diagnostic. Left: normal Rust/WebGL player. Right: optional WebGPU scene
        snapshot. The preview supports only a limited primitive subset and does not implement
        depth testing or guaranteed HDR highlights yet.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 16 }}>
        <button type="button" onClick={() => setActive(v => !v)}
          style={{ padding: "8px 16px", border: "1px solid #7b82a3", borderRadius: 6 }}>
          {active ? "Pause" : "Start comparison"}
        </button>
        <label>HDR brightness <input type="range" min={1} max={6} step={0.1} value={intensity} onChange={e => setIntensity(Number(e.target.value))} /> {intensity.toFixed(1)}×</label>
        <label><input type="checkbox" checked={workaround} onChange={e => setWorkaround(e.target.checked)} /> Chrome 155 compositor workaround</label>
        <label><input type="checkbox" checked={preview}
          onChange={event => setPreview(event.target.checked)} /> WebGPU HDR preview</label>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", maxWidth: 1000, fontSize: 14 }}>
        <span>WebGL</span><span>{preview ? "WebGPU HDR (experimental)" : "Preview disabled"}</span>
      </div>
      <style>{`\n        .hdr-compare-player { width: 100%; height: 100%; min-width: 0; }\n        .hdr-compare-player #visamp-stage,\n        .hdr-compare-player canvas { min-width: 0; }\n      `}</style>
      <div style={{ width: "100%", maxWidth: 1000, height: 440, minWidth: 0, border: "1px solid #555", marginTop: 8 }}>
        <VisampCanvas source={SOURCE} active={active} hdrPreview={preview}
          hdrIntensity={intensity} hdrCompositingWorkaround={workaround}
          className="hdr-compare-player"
          onCompileResult={result => setMessage(result.ok ? "Visript loaded" : result.diagnostics.map(d => d.message).join("; "))}
          onLog={entry => setMessage(entry.message)} />
      </div>
      <p role="status" style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{message}</p>
      <p style={{ maxWidth: 900, lineHeight: 1.5 }}>
        Run on Chrome with Apple XDR Display enabled. If the HDR half shows an unsupported-feature
        error or is blank, record the message and browser console errors. Do not use this route
        as evidence of full rendering parity.
      </p>
    </main>
  );
}
