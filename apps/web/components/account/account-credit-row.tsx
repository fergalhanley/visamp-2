"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function AccountCreditRow() {
  const [balance, setBalance] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active: AbortController | undefined;
    const refresh = () => {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      void fetch("/api/billing", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Credits unavailable");
          const summary = await response.json();
          if (
            typeof summary.available !== "number" ||
            !Number.isFinite(summary.available)
          )
            throw new Error("Invalid credit balance");
          if (!controller.signal.aborted) {
            setBalance(summary.available);
            setFailed(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active?.abort();
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {failed
          ? "Credits unavailable"
          : balance === null
            ? "Loading credits…"
            : `${balance.toLocaleString()} credits`}
      </p>
      <Link
        href="/account/billing"
        className="inline-flex cursor-pointer items-center justify-center rounded-md border border-emerald-500 px-4 py-2 text-sm text-emerald-400 transition hover:bg-emerald-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Go to Credits &amp; Billing
      </Link>
    </div>
  );
}
