"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- full navigation resets the singleton WASM canvas when opening site policy pages */
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { observePlayback } from "@/lib/analytics/playback";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  consent,
  consentKey,
  identifyAnalytics,
  pageViewed,
  setAnalyticsConsent,
} from "@/lib/analytics/client";

export function AnalyticsPreferencesButton() {
  return (
    <button
      type="button"
      className="cursor-pointer underline underline-offset-4"
      onClick={() =>
        window.dispatchEvent(new Event("visamp:analytics-preferences"))
      }
    >
      Analytics preferences
    </button>
  );
}

function subscribeConsent(listener: () => void) {
  window.addEventListener("visamp:analytics-consent", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("visamp:analytics-consent", listener);
    window.removeEventListener("storage", listener);
  };
}
export function AnalyticsProvider() {
  const { user, loading } = useAuth();
  const path = usePathname();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<boolean | null>(null);
  const choice = useSyncExternalStore(
    subscribeConsent,
    consent,
    () => "loading",
  );
  useEffect(() => {
    const show = () => setOpen(true);
    const storage = (event: StorageEvent) => {
      if (event.key !== consentKey) return;
      if (consent() !== "accepted") void setAnalyticsConsent(false);
    };
    window.addEventListener("visamp:analytics-preferences", show);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("visamp:analytics-preferences", show);
      window.removeEventListener("storage", storage);
    };
  }, []);
  useEffect(() => {
    if (loading) return;
    identifyAnalytics(user?.id ?? null);
    if (choice === "accepted") void pageViewed(path);
  }, [user?.id, loading, path, choice]);
  useEffect(() => {
    if (choice !== "accepted" || loading) return;
    return observePlayback();
  }, [choice, loading, user?.id]);
  const choose = (accepted: boolean) => {
    setOpen(true);
    setSaving(true);
    setError("");
    void setAnalyticsConsent(accepted).then((saved) => {
      setSaving(false);
      if (!saved) {
        setError(
          "Your browser preference was saved, but we couldn’t update pending server analytics. Please retry.",
        );
        return;
      }
      setOpen(false);
      void pageViewed(path);
    });
  };
  if (!(open ?? choice === null)) return null;
  return (
    <section
      aria-labelledby="analytics-consent-heading"
      aria-describedby="analytics-consent-description"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg sm:p-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h2 id="analytics-consent-heading" className="text-sm font-semibold">Help improve VisAmp?</h2>
          <p id="analytics-consent-description" className="mt-1 text-sm text-muted-foreground">
            Allow optional usage analytics to help us understand listening and
            creation. We use Mixpanel in the US. We don’t send your code,
            prompts or audio. You can change this choice in Analytics
            preferences or on your account page. <a href="/site/privacy-policy" className="underline underline-offset-4">Privacy policy</a>
          </p>
          {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button className="site-button primary" disabled={saving} onClick={() => choose(true)}>
            Allow analytics
          </Button>
          <Button
              disabled={saving}
              variant="outline"
              onClick={() => choose(false)}
          >
            Decline analytics
          </Button>
        </div>
      </div>
    </section>
  );
}
