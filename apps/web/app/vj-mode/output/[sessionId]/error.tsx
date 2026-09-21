"use client";
import { useOutputPointer } from "@/components/sets/use-output-pointer";
/** Keep captured output neutral. The operator detects the lost heartbeat and offers recovery. */
export default function OutputError() {
  const { surface, hidden } = useOutputPointer();
  return (
    <div
      ref={surface}
      aria-label="Output unavailable"
      style={{
        position: "fixed",
        inset: 0,
        background: "black",
        cursor: hidden ? "none" : "default",
      }}
    />
  );
}
