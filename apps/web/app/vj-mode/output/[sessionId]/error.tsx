"use client";
/** Keep captured output neutral. The operator detects the lost heartbeat and offers recovery. */
export default function OutputError() {
  return (
    <div
      aria-label="Output unavailable"
      style={{
        position: "fixed",
        inset: 0,
        background: "black",
        cursor: "none",
      }}
    />
  );
}
