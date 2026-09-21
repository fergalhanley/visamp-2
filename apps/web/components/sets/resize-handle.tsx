"use client";
export function ResizeHandle({
  value,
  onChange,
  label,
  min = 220,
  max = 650,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className="set-divider"
      onKeyDown={(e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          onChange(
            Math.max(
              min,
              Math.min(max, value + (e.key === "ArrowDown" ? 10 : -10)),
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        const y = e.clientY,
          el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const move = (ev: PointerEvent) =>
          onChange(Math.max(min, Math.min(max, value + ev.clientY - y)));
        const done = () => {
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", done);
          el.removeEventListener("pointercancel", done);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", done);
        el.addEventListener("pointercancel", done);
      }}
    />
  );
}
