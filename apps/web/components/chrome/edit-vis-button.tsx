"use client";

import { Pencil } from "lucide-react";

import { useAuth } from "@/components/auth/auth-provider";
import { barButton, barButtonBlue, barLabel } from "@/components/chrome/bar-button";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

/**
 * Opens the playing visualisation in the editor.
 *
 * Only appears for its owner, so it renders nothing rather than gating on
 * click the way Create and Fork do: there is no sign-in that would make
 * someone else's work editable.
 *
 * A plain link, and deliberately a hard navigation — the editor's preview
 * needs a fresh document to claim the WASM singleton off the player.
 */
export function EditVisButton({ className }: { className?: string }) {
  const { user } = useAuth();
  const current = useSessionStore((s) => s.current);

  if (!user || !current.ownerId || current.ownerId !== user.id) return null;

  return (
    <a
      href={`/edit/${current.id}`}
      title={`Edit ${current.title}`}
      className={cn(barButton, barButtonBlue, className)}
    >
      <Pencil className="h-4 w-4" />
      <span className={barLabel}>Edit Vis</span>
    </a>
  );
}
