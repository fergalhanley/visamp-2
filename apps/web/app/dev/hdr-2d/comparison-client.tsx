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
  const [workaround, setWorkaround] = useState(true);
  const [hdrDetected, setHdrDetected] = useState<boolean | null>(null);
  const [status, setStatus] = useState("Initializing WebGPU…");
  const rendererRef = useRef<HdrSceneRenderer | null>(null);

  // Defer GPU setup until after React's development StrictMode effect replay.
  // Without this, a cancelled async setup can unconfigure the newer canvas.
  useEffect(() => {
    let cancelled = false;
    let renderer: HdrSceneRenderer | null = null;
    const media = window.matchMedia("(dynamic-range: high)");
    setHdrDetected(media.matches);
    const timer = window.setTimeout(() => {
      void HdrSceneRenderer.create(hdrRef.current!, "extended").then(created => {
        if (cancelled) {
          created.dispose();
          return;
        }
        renderer = created;
        rendererRef.current = created;
        setStatus("WebGPU extended canvas ready");
      }).catch(error => {
        if (!cancelled) setStatus(error instanceof Error ? error.message : String(error));
      });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      rendererRef.current = null;
      renderer?.dispose();
    };
  }, []);

  // Canvas2D reference is independent of the GPU lifecycle.
  useEffect(() => {
    const ctx = sdrRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#030306";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgb(0,191,255)";
    ctx.beginPath();
    ctx.arc(175, 165, 85, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgb(255,51,115)";
    ctx.fillRect(355, 85, 175, 165);
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || status !== "WebGPU extended canvas ready") return;
    try {
      renderer.render(tessellateHdr2D(makeFrame(intensity)));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }, [intensity, status]);

  return (
    <main style={{ background: "#080b14", color: "#f5f7ff", minHeight: "100vh", padding: 24 }}>
      <h1 style={{ fontSize: 24 }}>Visamp experimental 2D HDR</h1>
      <p>Development-only standalone geometry comparison, not yet connected to live Visript 2D commands.</p>
      <label>HDR intensity <input type="range" min="1" max="6" step="0.1" value={intensity}
        onChange={e => setIntensity(Number(e.target.value))} /> {intensity.toFixed(1)}×</label>
      <label style={{ display: "block", marginTop: 12 }}><input type="checkbox" checked={workaround} onChange={e => setWorkaround(e.target.checked)} /> Chrome 155 HDR compositor workaround</label>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
          <p>Canvas 2D reference</p>
          <canvas ref={sdrRef} width={WIDTH} height={HEIGHT} style={{ width: "100%", height: "auto", display: "block" }} />
        </div>
        <div style={{ flex: "1 1 400px", minWidth: 0 }}>
          <p>WebGPU extended HDR</p>
          <div style={{ position: "relative" }}>
            <canvas ref={hdrRef} width={WIDTH} height={HEIGHT} style={{ width: "100%", height: "auto", display: "block" }} />
            {workaround && <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" }} />}
          </div>
        </div>
      </div>
      <p role="status">{status} · Display HDR query: {hdrDetected === null ? "checking" : hdrDetected ? "high" : "not high"}</p>
    </main>
  );
}
