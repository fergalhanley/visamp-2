"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M21.35 11.1h-9.17v2.92h5.27a4.51 4.51 0 0 1-1.95 2.96v2.46h3.15c1.84-1.7 2.9-4.2 2.9-7.17 0-.66-.06-1.3-.2-1.91z"
      />
      <path
        fill="currentColor"
        d="M12.18 21.6c2.64 0 4.85-.87 6.47-2.36l-3.15-2.46c-.87.59-2 .94-3.32.94-2.55 0-4.71-1.72-5.48-4.04H3.44v2.54a9.77 9.77 0 0 0 8.74 5.38z"
        opacity=".75"
      />
      <path
        fill="currentColor"
        d="M6.7 13.68a5.87 5.87 0 0 1 0-3.75V7.39H3.44a9.79 9.79 0 0 0 0 8.83l3.26-2.54z"
        opacity=".5"
      />
      <path
        fill="currentColor"
        d="M12.18 5.9c1.44 0 2.73.5 3.75 1.47l2.79-2.79C17.02 2.98 14.82 2 12.18 2A9.77 9.77 0 0 0 3.44 7.39l3.26 2.54c.77-2.32 2.93-4.03 5.48-4.03z"
        opacity=".9"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2A10 10 0 0 0 8.84 21.5c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.75c0 .26.18.58.69.48A10 10 0 0 0 12 2z"
      />
    </svg>
  );
}

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Path to return to after the OAuth round trip. */
  next?: string;
}

/**
 * E5.1 — Google, GitHub and email.
 *
 * Email uses a password rather than a magic link, because E5.2 calls for
 * Turnstile on signup *and password reset*, which only makes sense with
 * passwords. The Turnstile work itself is still outstanding.
 */
export function SignInDialog({ open, onOpenChange, next = "/" }: SignInDialogProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const signInWithProvider = async (provider: "google" | "github") => {
    setError(null);
    setPending(true);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
    // On success the browser navigates away; leave `pending` set.
  };

  const submitEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    const supabase = createClient();

    if (mode === "sign-up") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(next)}`,
        },
      });

      if (signUpError) setError(signUpError.message);
      else setNotice("Check your email to confirm your account.");
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) setError(signInError.message);
      else onOpenChange(false);
    }

    setPending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {mode === "sign-in" ? "Sign in to VisAmp" : "Create an account"}
          </DialogTitle>
          <DialogDescription>
            Watching is anonymous. You only need an account to create, like and
            comment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void signInWithProvider("google")}
          >
            <GoogleIcon />
            Continue with Google
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void signInWithProvider("github")}
          >
            <GitHubIcon />
            Continue with GitHub
          </Button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={submitEmail} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="auth-email">Email</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {notice && <p className="text-xs text-muted-foreground">{notice}</p>}

          <Button type="submit" disabled={pending}>
            {mode === "sign-in" ? "Sign in" : "Sign up"}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
            setNotice(null);
          }}
          className={cn("text-xs text-muted-foreground hover:text-foreground")}
        >
          {mode === "sign-in"
            ? "No account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </DialogContent>
    </Dialog>
  );
}
