"use client";
import { useEffect, useRef } from "react";
export function LoadMore({
  more,
  loading,
  hasMore,
}: {
  more: () => void;
  loading: boolean;
  hasMore: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) more();
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, loading, hasMore]);
  if (!hasMore && !loading) return null;
  return (
    <button
      ref={ref}
      type="button"
      disabled={loading}
      onClick={more}
      className="w-full px-4 py-4 text-xs text-muted-foreground"
    >
      {loading ? "Loading…" : "Load more"}
    </button>
  );
}
