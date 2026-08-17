"use client";

import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
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

/** Mirrors the profiles_username_format CHECK constraint. */
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

type Availability = "idle" | "checking" | "free" | "taken" | "invalid";

interface UsernameClaimDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * E5.3 — claim a unique username at first sign-in. It becomes the artist
 * permalink, so it is checked against the same rules the database enforces
 * rather than trusting the client alone.
 */
export function UsernameClaimDialog({ open, onOpenChange }: UsernameClaimDialogProps) {
  const { user, refreshProfile } = useAuth();
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const candidate = username.trim();
  // Format is a pure function of the input, so it is derived rather than
  // stored — only the server's answer is genuinely state.
  const format = !candidate
    ? "empty"
    : USERNAME_PATTERN.test(candidate)
      ? "ok"
      : "invalid";

  const [checked, setChecked] = useState<{ name: string; free: boolean } | null>(
    null,
  );

  // Debounced availability probe. The RPC returns only a boolean, so it cannot
  // be used to enumerate existing names.
  useEffect(() => {
    if (format !== "ok") return;

    let active = true;
    const timer = window.setTimeout(() => {
      void createClient()
        .rpc("username_available", { candidate })
        .then(({ data, error: rpcError }) => {
          if (active) setChecked({ name: candidate, free: !rpcError && Boolean(data) });
        });
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [candidate, format]);

  const availability: Availability =
    format === "empty"
      ? "idle"
      : format === "invalid"
        ? "invalid"
        : checked?.name === candidate
          ? checked.free
            ? "free"
            : "taken"
          : "checking";

  const claim = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || availability !== "free") return;

    setPending(true);
    setError(null);

    const { error: updateError } = await createClient()
      .from("profiles")
      .update({ username: candidate })
      .eq("id", user.id);

    if (updateError) {
      // Most likely the unique index — someone claimed it in the meantime.
      setError(
        updateError.code === "23505"
          ? "That username was just taken. Try another."
          : updateError.message,
      );
      setPending(false);
      return;
    }

    await refreshProfile();
    setPending(false);
    onOpenChange(false);
  };

  const hint = {
    idle: "3–30 characters. Letters, numbers and underscores.",
    checking: "Checking…",
    invalid: "3–30 characters. Letters, numbers and underscores only.",
    taken: "That username is taken.",
    free: "Available.",
  }[availability];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Choose a username</DialogTitle>
          <DialogDescription>
            This is your public name and your profile address. You can keep
            watching without one.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={claim} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setUsername(event.target.value)}
            />
            <p
              className={
                availability === "taken" || availability === "invalid"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {hint}
            </p>
            {candidate && availability === "free" && (
              <p className="text-xs text-muted-foreground">
                Your profile: visamp.io/artist/{candidate}
              </p>
            )}
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button type="submit" disabled={pending || availability !== "free"}>
            Claim username
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
