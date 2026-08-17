"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { cn } from "@/lib/utils";

/**
 * Survives the OAuth round trip, which bounces the whole document. Without it
 * the viewer signs in and lands back on the player wondering where the editor
 * went.
 */
const INTENT_KEY = "visamp.intent.create-vis";

/**
 * Creating requires an account (principle 5). The button is always visible and
 * gates on click, rather than hiding itself from logged-out visitors.
 *
 * Submits a real form rather than linking: /edit is POST-only so a prefetch
 * cannot create stray drafts, and the full navigation is what lets the editor's
 * preview canvas claim the WASM singleton.
 */
export function CreateVisButton() {
  const { user, loading } = useAuth();
  const [signInOpen, setSignInOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Replay the intent once the session lands.
  useEffect(() => {
    if (!user) return;
    if (sessionStorage.getItem(INTENT_KEY) !== "1") return;

    sessionStorage.removeItem(INTENT_KEY);
    formRef.current?.requestSubmit();
  }, [user]);

  const onClick = (event: React.MouseEvent) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    if (!user) {
      event.preventDefault();
      sessionStorage.setItem(INTENT_KEY, "1");
      setSignInOpen(true);
    }
    // Signed in: let the form submit normally.
  };

  return (
    <>
      <form ref={formRef} method="POST" action="/edit" className="shrink-0">
        <button
          type="submit"
          onClick={onClick}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium",
            "bg-emerald-500 text-black shadow-lg shadow-emerald-500/20",
            "transition hover:bg-emerald-400",
            "focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:outline-none",
          )}
        >
          <Plus className="h-4 w-4" />
          Create Vis
        </button>
      </form>

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} next="/" />
    </>
  );
}
