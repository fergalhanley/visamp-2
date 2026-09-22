import type { CSSProperties } from "react";
import type { TitleOverlay } from "@/lib/sets/title-overlays";
import { titlePositions } from "@/lib/sets/title-properties";
export function TitleOverlayLayer({ titles }: { titles: TitleOverlay[] }) {
  return (
    <div
      data-title-overlays
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        containerType: "inline-size",
        color: "white",
      }}
    >
      {titlePositions.map((position) => {
        const items = titles.filter((t) => t.position === position);
        if (!items.length) return null;
        const [vertical, horizontal] = position.split(" ");
        const style: CSSProperties = {
          position: "absolute",
          maxWidth: "88%",
          display: "flex",
          flexDirection: "column",
          gap: "1cqw",
          top:
            vertical === "Top" ? "5%" : vertical === "Mid" ? "50%" : undefined,
          bottom: vertical === "Bottom" ? "5%" : undefined,
          left:
            horizontal === "Left"
              ? "5%"
              : horizontal === "Center"
                ? "50%"
                : undefined,
          right: horizontal === "Right" ? "5%" : undefined,
          transform: `translate(${horizontal === "Center" ? "-50%" : "0"}, ${vertical === "Mid" ? "-50%" : "0"})`,
          textAlign:
            horizontal === "Left"
              ? "left"
              : horizontal === "Right"
                ? "right"
                : "center",
          textShadow: "0 1px 4px #000, 0 0 12px #000",
          overflowWrap: "anywhere",
        };
        return (
          <div key={position} style={style}>
            {items.map((t) => (
              <div
                key={t.id}
                data-clip-title={t.id}
                style={{
                  fontSize: { small: "2cqw", medium: "3cqw", large: "4.5cqw" }[
                    t.size
                  ],
                  lineHeight: 1.2,
                }}
              >
                <div style={{ fontWeight: 600 }}>{t.title}</div>
                {t.attribution && (
                  <div style={{ fontSize: "0.65em", marginTop: "0.2em" }}>
                    {t.attribution}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
