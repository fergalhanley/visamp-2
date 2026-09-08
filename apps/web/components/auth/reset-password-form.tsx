"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ next }: { next: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const { error } = await createClient().auth.updateUser({ password });
    if (error) setMessage(error.message);
    else {
      setComplete(true);
      setMessage("Your password has been updated.");
    }
    setPending(false);
  };

  return (
    <main className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="visamp-surface w-full max-w-sm rounded-2xl border p-6">
        <h1 className="text-base font-semibold">Choose a new password</h1>
        {complete ? (
          <>
            <p className="mt-3 text-sm text-muted-foreground">{message}</p>
            <Link
              href={next}
              className="mt-5 inline-block text-sm hover:underline"
            >
              Continue
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="mt-4 grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {message && <p className="text-xs text-destructive">{message}</p>}
            <Button type="submit" disabled={pending}>
              Update password
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
