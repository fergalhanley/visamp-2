"use client";

import { useEffect, useRef, useState } from "react";
import { tessellateHdr2D, type Hdr2DFrame } from "@visamp/player";
import { HdrSceneRenderer } from "@visamp/player";

const WIDTH = 640;
const HEIGHT = 360;

function makeFrame(intensity: number): Hdr2DFrame {
  return {
    width: WIDTH, height: HEIGHT, clear: [0.01, 0.01, 0.02, 1],
    shapes: [
      { kind: "circle", x: 175, y: 165, radius: 85, color: [0, 0.75, 1, 1], intensity },
      { kind: "rect", x: 355, y: 85, width: 175, height: 165, color: [1, 0.2, 0.45, 1], intensity },
    ]
  };
}

export function Hdr2DComparisonClient() {
  const sdrRef = useRef<HTMLCanvasElement>(null);
  const hdrRef = useRef<HTMLCanvasElement>(null);
  const [intensity, setIntensity] = useState(3);
  const [status, setStatus] = useState("Initializing WebGPU…");
  const rendererRef = useRef<HdrSceneRenderer | null>(null);

  useEffect(() => {
    let cancelled = false;
    void HdrSceneRenderer.create(hdrRef.current!, "extended").then(renderer => {
      if (cancelled) { renderer.dispose(); return; }
      rendererRef.current = renderer;
      setStatus("WebGPU extended canvas ready");
    }).catch(e => { if (!cancelled) setStatus(String(e)); });
    return () => {
      cancelled = true;
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = sdrRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#030306";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = "rgb(0,191,255)";
      ctx.beginPath();
      ctx.arc(175, 165, 85, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgb(255,51,115)";
      ctx.fillRect(355, 85, 175, 165);
    }
    try {
      rendererRef.current?.render(tessellateHdr2D(makeFrame(intensity)));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [intensity, status === "WebGPU extended canvas ready"]);

  return (
    <main style={{ background: "#080b14", color: "#f5f7ff", minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Visamp experimental 2D HDR</h1>
      <p>Development-only standalone geometry comparison, not yet connected to live Visript 2D commands.</p>
      <label>HDR intensity <input type="range" min="1" max="6" step="0.1" value={intensity}
        onChange={e => setIntensity(Number(e.target.value))} /> {intensity.toFixed(1)}×</label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
          <p>Canvas 2D reference</p>
          <canvas ref={sdrRef} width={WIDTH} height={HEIGHT} style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
          <p>WebGPU extended HDR</p>
          <canvas ref={hdrRef} width={WIDTH} height={HEIGHT} style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
      </div>
      <p role="status">{status}</p>
    </main>
  );
}
