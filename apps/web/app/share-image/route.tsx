import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#090b0a", color: "#e9f0e9", borderBottom: "12px solid #bef264" }}>
      <div style={{ fontSize: 110, fontWeight: 700, letterSpacing: -6 }}>VisAmp</div>
      <div style={{ fontSize: 44, marginTop: 25, color: "#bef264" }}>Music for your eyes.</div>
      <div style={{ fontSize: 28, marginTop: 30 }}>Discover, play and create music visualisations.</div>
      <div style={{ fontSize: 24, marginTop: 55, color: "#9ba69e" }}>www.visamp.io</div>
    </div>,
    { width: 1200, height: 630 },
  );
}
