"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { observePlayback } from "@/lib/analytics/playback";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  return (
    <Dialog open={open ?? choice === null} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Help improve VisAmp?</DialogTitle>
          <DialogDescription>
            Allow optional usage analytics to help us understand listening and
            creation. We use Mixpanel in the US. We don’t send your code,
            prompts or audio. You can change this choice in Analytics
            preferences.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={saving}
            variant="outline"
            onClick={() => choose(false)}
          >
            Decline analytics
          </Button>
          <Button disabled={saving} onClick={() => choose(true)}>
            Allow analytics
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
