"use client";

import { useState } from "react";
import { VisampCanvas } from "@visamp/player";

// The Rust engine owns the SDR stage and records the very same commands
// for the experimental WebGPU HDR panel. No hard-coded JavaScript geometry.
const SOURCE = `context 2d
prop angle = 0.0
on_frame { angle = $TIME_SEC }

render {
  draw::background(color: color::rgb(r: 0.012, g: 0.012, b: 0.024))
  draw::circle(x: 175.0, y: 165.0, radius: 85.0, color: color::rgb(r: 0.0, g: 0.75, b: 1.0), intensity: 3.0)
  draw::rect(x: 355.0, y: 85.0, width: 175.0, height: 165.0, color: color::rgb(r: 1.0, g: 0.2, b: 0.45), intensity: 3.0, rotation_rad: angle, corner_radius: 16)
  draw::text(content: "HDR rotation", x: 30, y: 340, size: 24, intensity: 3)
}
`;

export function Hdr2DComparisonClient() {
  const [active, setActive] = useState(false);
  const [script, setScript] = useState(SOURCE);
  const [preview, setPreview] = useState(true);
  const [message, setMessage] = useState("");
  const [hdrDiagnostic, setHdrDiagnostic] = useState("HDR not started");
  return (
    <main style={{ background: "#080b14", color: "#f5f7ff", minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Visamp experimental live 2D HDR</h1>
      <p>Development-only: the same Viscript render block feeds the Canvas 2D stage and a read-only Rust snapshot rendered through WebGPU. Drawing operations, transforms, gradients, text, images, blending, effects and feedback share the HDR presentation path.</p>
      <button type="button" onClick={() => setActive(v => !v)}
        style={{ padding: "8px 16px", border: "1px solid #7b82a3", borderRadius: 6 }}>
        {active ? "Pause" : "Start comparison"}
      </button>
      <label style={{ marginLeft: 18 }}>
        <input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} /> WebGPU preview
      </label>
      <p>Left: existing Canvas 2D. Right: WebGPU extended HDR. Change the Viscript below, or paste the standalone dev/hdr-2d-acceptance.viscript scene. The SDR canvas ignores HDR intensity.</p>
      <details style={{ marginBottom: 16 }}><summary>Edit live Viscript test scene</summary>
        <textarea aria-label="Viscript scene" spellCheck={false} value={script} onChange={e => setScript(e.target.value)}
          style={{ display: "block", width: "100%", minHeight: 240, marginTop: 8, fontFamily: "monospace", background: "#151a25", color: "#fff" }} />
        <button type="button" onClick={() => setScript(SOURCE)}>Restore starter scene</button>
      </details>
      <style>{`
        .hdr-2d-player { width: 100%; height: 100%; min-width: 0; }
        .hdr-2d-player #visamp-stage, .hdr-2d-player canvas { min-width: 0; }
      `}</style>
      <div style={{ width: "100%", maxWidth: 1300, height: 400, minWidth: 0, border: "1px solid #555" }}>
        <VisampCanvas source={script} active={active} hdrPreview={preview} hdr2dPreview autoHdr2D={false}
          className="hdr-2d-player"
          onHdr2DDiagnostic={setHdrDiagnostic}
          onCompileResult={result => setMessage(result.ok ? "Viscript loaded" : result.diagnostics.map(d => d.message).join("; "))}
          onLog={entry => setMessage(entry.message)} />
      </div>
      <p role="status">{hdrDiagnostic}</p>
      <p role="status" style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{message}</p>
    </main>
  );
}
