"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface VirtualListProps<T> {
  items: T[];
  /** Rows are a fixed height by design (E3.6), which is what makes this cheap. */
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  empty?: ReactNode;
}

/**
 * E3.9 — windows a long list down to the rows actually on screen. Fixed row
 * height means the whole thing is arithmetic: no measurement, no observers.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  renderRow,
  overscan = 4,
  className,
  empty,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // observe() delivers an initial callback, so there's no need to measure
    // synchronously here as well.
    const observer = new ResizeObserver(() => setViewport(element.clientHeight));
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const element = containerRef.current;
    if (element) setScrollTop(element.scrollTop);
  }, []);

  if (items.length === 0 && empty) {
    return <div className={className}>{empty}</div>;
  }

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewport / rowHeight) + overscan * 2;
  const last = Math.min(items.length, first + visibleCount);
  const slice = items.slice(first, last);

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={className}
      style={{ overflowY: "auto", overscrollBehavior: "contain" }}
    >
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {slice.map((item, index) => {
          const actualIndex = first + index;
          return (
            <div
              key={actualIndex}
              style={{
                position: "absolute",
                top: actualIndex * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderRow(item, actualIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
