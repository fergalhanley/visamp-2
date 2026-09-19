"use client";

import { useState, useSyncExternalStore } from "react";
import { consent, setAnalyticsConsent } from "@/lib/analytics/client";

function subscribe(listener: () => void) {
  window.addEventListener("visamp:analytics-consent", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("visamp:analytics-consent", listener);
    window.removeEventListener("storage", listener);
  };
}

export function AnalyticsPreferences() {
  const choice = useSyncExternalStore(subscribe, consent, () => "loading");
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState<boolean | null>(null);

  async function save(accepted: boolean) {
    setSaving(true);
    setRetry(null);
    try {
      if (!(await setAnalyticsConsent(accepted))) setRetry(accepted);
    } catch {
      setRetry(accepted);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="analytics-heading"
      className="visamp-surface mt-6 rounded-2xl border p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="analytics-heading" className="text-sm font-semibold">
          Usage analytics
        </h2>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            role="switch"
            aria-label="Usage analytics"
            aria-describedby="analytics-description"
            checked={choice === "accepted"}
            disabled={saving || choice === "loading"}
            onChange={(event) => void save(event.target.checked)}
            className="relative h-5 w-9 shrink-0 cursor-pointer appearance-none rounded-full bg-foreground/20 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-background after:transition-transform checked:bg-foreground checked:after:translate-x-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-wait disabled:opacity-50"
          />
          {choice === "accepted" ? "On" : "Off"}
        </label>
      </div>
      <p
        id="analytics-description"
        className="mt-2 text-sm text-muted-foreground"
      >
        Allow Mixpanel usage analytics to help improve listening and creation.
        This preference applies to this browser. Turning it off stops new
        tracking; it does not delete analytics already sent.
      </p>
      <p role="status" className="mt-2 text-xs text-muted-foreground">
        {saving ? "Saving preference…" : "Changes save automatically."}
      </p>
      {retry !== null && (
        <div className="mt-3 text-sm">
          <p role="alert">
            We couldn’t finish updating your analytics preference. Please retry
            to synchronise pending server analytics.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(retry)}
            className="mt-2 cursor-pointer underline underline-offset-4"
          >
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
